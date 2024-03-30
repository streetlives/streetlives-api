source .env.remote.prod
./scripts/backup.sh
source .env.remote.dev
./scripts/psql.sh -c "drop schema public cascade; create schema public; grant all on schema public to devuser; grant all on schema public to public;"
./scripts/restore.sh
