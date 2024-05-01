PGPASSWORD=$DATABASE_PASSWORD pg_dump -d $DATABASE_NAME -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -f prod-`date +%F`.dump -Fc
pg_restore -f prod-`date +%F`.sql prod-`date +%F`.dump 
