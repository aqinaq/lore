-- Add 'video' to the allowed drop types
ALTER TABLE drops DROP CONSTRAINT IF EXISTS drops_type_check;
ALTER TABLE drops ADD CONSTRAINT drops_type_check
  CHECK (type IN ('photo', 'voice', 'drawing', 'text', 'video'));
