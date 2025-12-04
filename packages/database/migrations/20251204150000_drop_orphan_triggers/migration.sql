-- Drop the orphaned trigger that references the old workspace_members table
DROP TRIGGER IF EXISTS api_keys_validate_workspace_link ON api_keys;
DROP FUNCTION IF EXISTS api_keys_validate_workspace_link_fn();

-- Also drop the profile link trigger since profile_id was removed from api_keys
DROP TRIGGER IF EXISTS api_keys_validate_profile_link ON api_keys;
DROP FUNCTION IF EXISTS api_keys_validate_profile_link_fn();
