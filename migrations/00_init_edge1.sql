-- Initialize edge1 database
CREATE DATABASE edge1_db;

-- Create read-only user for load balancer health checks
-- The lb_monitor user can query pg_stat_activity to determine node load
CREATE USER lb_monitor WITH PASSWORD 'admin';
GRANT CONNECT ON DATABASE edge1_db TO lb_monitor;

-- Grant access to pg_stat_activity (built-in system view)
-- In PostgreSQL 18, pg_stat_activity is accessible to all authenticated users
-- but we explicitly grant usage for clarity
GRANT USAGE ON SCHEMA pg_catalog TO lb_monitor;

-- Allow lb_monitor to see all connections (not just own)
-- This is required for accurate load balancing decisions
GRANT pg_read_all_stats TO lb_monitor;
