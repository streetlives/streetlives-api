#!/usr/bin/env bash
# Deploys monitoring/alarms.yaml, but only after checking that every API the alarms watch
# reports prod traffic in us-east-1. An alarm on a wrong ApiName/Stage never fires, so a
# target that can't be confirmed stops the deploy instead of producing a silent alarm.
#
# Needs AWS credentials with CloudFormation and CloudWatch write access.
# Usage: monitoring/deploy.sh [--check-only]
set -euo pipefail

REGION=us-east-1
STACK=streetlives-monitoring
TEMPLATE="$(dirname "$0")/alarms.yaml"
APIS=(StreetlivesPublicApi StreetlivesInternalApi)

if date -u -v-7d +%FT%TZ >/dev/null 2>&1; then
  START=$(date -u -v-7d +%FT%TZ)          # BSD/macOS
else
  START=$(date -u -d '7 days ago' +%FT%TZ) # GNU
fi
END=$(date -u +%FT%TZ)

for api in "${APIS[@]}"; do
  # Any AWS error aborts here (set -e); an unknown ApiName/Stage returns no datapoints.
  sums=$(aws cloudwatch get-metric-statistics --region "$REGION" \
    --namespace AWS/ApiGateway --metric-name Count \
    --dimensions "Name=ApiName,Value=$api" Name=Stage,Value=prod \
    --start-time "$START" --end-time "$END" --period 86400 --statistics Sum \
    --query 'Datapoints[].Sum' --output text)
  total=$(awk '{ for (i = 1; i <= NF; i++) t += $i } END { printf "%d", t }' <<<"$sums")
  if [ "$total" -le 0 ]; then
    echo "ABORT: $api has no prod requests in $REGION over the last 7 days." >&2
    echo "Its alarm would never fire. Fix the ApiName/Stage in alarms.yaml before deploying." >&2
    exit 1
  fi
  echo "ok: $api prod handled $total requests in the last 7 days"
done

aws cloudformation validate-template --region "$REGION" \
  --template-body "file://$TEMPLATE" >/dev/null
echo "ok: template is valid"

if [ "${1:-}" = "--check-only" ]; then
  exit 0
fi

aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file "$TEMPLATE"
