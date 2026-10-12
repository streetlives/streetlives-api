# Monitoring

`alarms.yaml` is a CloudFormation stack holding the API's CloudWatch alarms
(tracked in streetlives/yourpeer.nyc#673). The CI deploy workflows don't touch it. Someone with
write access to the AWS account deploys it by hand with `deploy.sh`:

```bash
monitoring/deploy.sh --check-only   # verify targets and template, change nothing
monitoring/deploy.sh                # verify, then deploy the stack to us-east-1
```

Before deploying, the script requires each API the alarms watch (`APIS` in `deploy.sh`, which must
match the `ApiName`s in `alarms.yaml`) to show `prod` requests in us-east-1 over the last 7 days. It
stops on any AWS error, and the template itself refuses any region but us-east-1. An alarm on a
wrong `ApiName`/`Stage` would watch a metric that never arrives and stay quiet forever.

Alarm notifications go to the `alarms` SNS topic (the template's `AlarmTopicArn` parameter).

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
