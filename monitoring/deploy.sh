#!/usr/bin/env bash
# Deploys monitoring/alarms.yaml, but only after checking that every API the alarms watch is
# the expected one and is serving prod traffic in us-east-1. CloudWatch alarms select their
# metric by ApiName/Stage, and an alarm on the wrong pair never fires, so any target that
# can't be confirmed stops the deploy instead of producing a silent alarm.
#
# Needs AWS credentials with CloudFormation and CloudWatch write access.
# Usage: monitoring/deploy.sh [--check-only]
# Tested by test/unit/monitoring-deploy.test.js.
set -euo pipefail

REGION=us-east-1
STACK=streetlives-monitoring
TEMPLATE="${ALARMS_TEMPLATE:-$(dirname "$0")/alarms.yaml}"
# ApiName=rest-api-id for every API alarmed in alarms.yaml.
TARGETS=(StreetlivesPublicApi=rdxk79h7wa StreetlivesInternalApi=czmlz2z6h3)

fail() {
  echo "ABORT: $*" >&2
  exit 1
}

# The template and TARGETS must name the same APIs, or some alarm goes unchecked.
template_names=$(grep -A1 'Name: ApiName' "$TEMPLATE" | sed -n 's/.*Value: *//p' | sort -u)
target_names=$(printf '%s\n' "${TARGETS[@]%%=*}" | sort -u)
[ "$template_names" = "$target_names" ] \
  || fail "ApiNames in $TEMPLATE ($(tr '\n' ' ' <<<"$template_names")) don't match TARGETS ($(tr '\n' ' ' <<<"$target_names"))."

if date -u -v-7d +%FT%TZ >/dev/null 2>&1; then
  START=$(date -u -v-7d +%FT%TZ)          # BSD/macOS
else
  START=$(date -u -d '7 days ago' +%FT%TZ) # GNU
fi
END=$(date -u +%FT%TZ)

for target in "${TARGETS[@]}"; do
  name=${target%%=*}
  id=${target#*=}

  # API Gateway names aren't unique, and their metrics are keyed by name: the name must
  # belong to exactly the expected API and nothing else.
  ids=$(aws apigateway get-rest-apis --region "$REGION" \
    --query "items[?name=='$name'].id" --output text)
  [ "$ids" = "$id" ] \
    || fail "ApiName $name should belong only to $id, but resolves to: ${ids:-nothing}."

  aws apigateway get-stage --region "$REGION" --rest-api-id "$id" --stage-name prod >/dev/null \
    || fail "$name ($id) has no prod stage."

  sums=$(aws cloudwatch get-metric-statistics --region "$REGION" \
    --namespace AWS/ApiGateway --metric-name Count \
    --dimensions "Name=ApiName,Value=$name" Name=Stage,Value=prod \
    --start-time "$START" --end-time "$END" --period 86400 --statistics Sum \
    --query 'Datapoints[].Sum' --output text)
  total=$(awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9.]+$/) t += $i } END { printf "%d", t }' <<<"$sums")
  [ "$total" -gt 0 ] \
    || fail "$name ($id) has no prod requests in $REGION over the last 7 days; its alarm would never fire."

  echo "ok: $name is $id, prod handled $total requests in the last 7 days"
done

aws cloudformation validate-template --region "$REGION" \
  --template-body "file://$TEMPLATE" >/dev/null
echo "ok: template is valid"

if [ "${1:-}" = "--check-only" ]; then
  exit 0
fi

aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file "$TEMPLATE"
