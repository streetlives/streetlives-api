./scripts/psql.sh -c "drop schema public cascade; create schema public; grant all on schema public to $DATABASE_USER; alter schema public owner to $DATABASE_USER; grant all on schema public to public; create extension postgis"

