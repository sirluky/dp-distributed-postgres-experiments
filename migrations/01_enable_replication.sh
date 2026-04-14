#!/bin/bash
set -e

# Add replication permission to pg_hba.conf
echo "host replication all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"

# Reload configuration
pg_ctl reload -D "$PGDATA"

# Create physical replication slot for replica (enables slot synchronization in PG17/18)
psql -U admin -d postgres -c "SELECT pg_create_physical_replication_slot('replica_slot', true);" || true

echo "✅ Replication configuration complete"
