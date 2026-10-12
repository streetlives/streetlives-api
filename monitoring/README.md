# Monitoring

`alarms.yaml` is a CloudFormation stack holding the API's CloudWatch alarms
(tracked in streetlives/yourpeer.nyc#673). The CI deploy workflows don't touch it. Someone with
write access to the AWS account deploys it by hand, in `us-east-1` (the template refuses any
other region):

```bash
# Both APIs must report prod metrics under these exact names, or the alarms watch nothing.
for api in StreetlivesPublicApi StreetlivesInternalApi; do
  aws cloudwatch list-metrics --region us-east-1 --namespace AWS/ApiGateway \
    --metric-name 5XXError --dimensions Name=ApiName,Value=$api Name=Stage,Value=prod \
    --query "length(Metrics)" --output text | sed "s/^/$api: /"   # expect 1 each
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

Two API Gateway REST APIs front the same Lambda (`StreetlivesApiProdFunction` on their `prod`
stages), and both carry production traffic:

| API | Id |
|---|---|
| `StreetlivesPublicApi` | `rdxk79h7wa` (also mapped to `api.yourpeer.nyc`) |
| `StreetlivesInternalApi` | `czmlz2z6h3` |

Only the `prod` stages are alarmed. The `Stage` stages (test Lambda) are staging and
intentionally have no alarms.

## One-time cleanup after the first deploy

These hand-made alarms are superseded by the stack and should be deleted once it is up:

```bash
aws cloudwatch delete-alarms --region us-east-1 --alarm-names \
  StreetlivesServerlessApi_Stage_5XXError \
  StreetlivesServerlessApi_prod_5XXError
```
