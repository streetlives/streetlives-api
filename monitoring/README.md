# Monitoring

`alarms.yaml` is a CloudFormation stack holding the API's CloudWatch alarms
(tracked in streetlives/yourpeer.nyc#673). The CI deploy workflows don't touch it. Someone with
write access to the AWS account deploys it by hand:

```bash
aws cloudformation validate-template --template-body file://monitoring/alarms.yaml
aws cloudformation deploy \
  --stack-name streetlives-monitoring \
  --template-file monitoring/alarms.yaml
```

Alarm notifications go to the `alarms` SNS topic (override with
`--parameter-overrides AlarmTopicArn=...`).

## One-time cleanup after the first deploy

These hand-made alarms are superseded by the stack and should be deleted once it is up:

```bash
aws cloudwatch delete-alarms --alarm-names \
  StreetlivesServerlessApi_Stage_5XXError \
  StreetlivesServerlessApi_prod_5XXError
```
