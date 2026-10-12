# Monitoring

`alarms.yaml` is a CloudFormation stack holding the API's CloudWatch alarms
(tracked in streetlives/yourpeer.nyc#673). The CI deploy workflows don't touch it. Someone with
write access to the AWS account deploys it by hand, in `us-east-1` (the template refuses any
other region):

```bash
# Both APIs must report prod metrics under these exact names and carry traffic, or the alarms
# watch nothing. Expect a non-zero 7-day request count for each.
for api in StreetlivesPublicApi StreetlivesInternalApi; do
  aws cloudwatch get-metric-statistics --region us-east-1 --namespace AWS/ApiGateway \
    --metric-name Count --dimensions Name=ApiName,Value=$api Name=Stage,Value=prod \
    --start-time "$(date -u -v-7d +%FT%TZ 2>/dev/null || date -u -d '7 days ago' +%FT%TZ)" \
    --end-time "$(date -u +%FT%TZ)" --period 86400 --statistics Sum \
    --query "sum(Datapoints[].Sum)" --output text | sed "s/^/$api prod requests (7d): /"
done

aws cloudformation validate-template --region us-east-1 \
  --template-body file://monitoring/alarms.yaml
aws cloudformation deploy --region us-east-1 \
  --stack-name streetlives-monitoring \
  --template-file monitoring/alarms.yaml
```

Alarm notifications go to the `alarms` SNS topic (override with
`--parameter-overrides AlarmTopicArn=...`).

## What is monitored

Two API Gateway REST APIs in us-east-1 front the same Lambda (`StreetlivesApiProdFunction` on
their `prod` stages), and both carry production traffic:

| API | Id | Known callers |
|---|---|---|
| `StreetlivesPublicApi` | `rdxk79h7wa` | Unauthenticated reads; also mapped to `api.yourpeer.nyc` |
| `StreetlivesInternalApi` | `czmlz2z6h3` | yourpeer.nyc's server-side data fetches (`fetchInternalApi` in yourpeer.nyc-nextjs `src/components/internal-api-fetcher.ts`, which takes a Cognito client-credentials token with scope `https://czmlz2z6h3.execute-api.us-east-1.amazonaws.com/access`) |

The internal API is the busier one. When this was written its hourly `prod` request count tracked
yourpeer.nyc's own traffic almost exactly (correlation 0.98 over 7 days).

Only the `prod` stages are alarmed. The `Stage` stages (test Lambda) are staging and
intentionally have no alarms.

## One-time cleanup after the first deploy

These hand-made alarms are superseded by the stack and should be deleted once it is up:

```bash
aws cloudwatch delete-alarms --region us-east-1 --alarm-names \
  StreetlivesServerlessApi_Stage_5XXError \
  StreetlivesServerlessApi_prod_5XXError
```
