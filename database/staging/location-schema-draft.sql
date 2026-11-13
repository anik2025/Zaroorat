-- KotaMitra Phase 2B: isolated nationwide location schema draft.
-- Draft only; do not execute as part of Phase 2B Task 2.
-- PostgreSQL-oriented; UUID defaults require pgcrypto in the eventual migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE location_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  publisher TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('official','open_data','partner','manual','other')),
  base_url TEXT, version_label TEXT, license_name TEXT, license_url TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL, checksum TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version_label), CHECK (length(btrim(name)) > 0)
);

CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES location_sources(id),
  batch_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged','running','completed','completed_with_errors','failed','cancelled')),
  source_version TEXT, source_file_name TEXT, source_url TEXT, source_checksum TEXT,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, batch_key),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2_code TEXT NOT NULL UNIQUE CHECK (iso2_code = upper(iso2_code) AND length(iso2_code) = 2),
  iso3_code TEXT UNIQUE CHECK (iso3_code IS NULL OR (iso3_code = upper(iso3_code) AND length(iso3_code) = 3)),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0), official_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_id UUID REFERENCES location_sources(id), import_batch_id UUID REFERENCES import_batches(id),
  source_record_key TEXT, source_url TEXT, raw_payload_hash TEXT, imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), country_id UUID NOT NULL REFERENCES countries(id),
  code TEXT, name TEXT NOT NULL CHECK (length(btrim(name)) > 0), state_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, source_id UUID REFERENCES location_sources(id),
  import_batch_id UUID REFERENCES import_batches(id), source_record_key TEXT, source_url TEXT,
  raw_payload_hash TEXT, imported_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (country_id, name)
);

CREATE TABLE districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), state_id UUID NOT NULL REFERENCES states(id),
  code TEXT, name TEXT NOT NULL CHECK (length(btrim(name)) > 0), is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_id UUID REFERENCES location_sources(id), import_batch_id UUID REFERENCES import_batches(id),
  source_record_key TEXT, source_url TEXT, raw_payload_hash TEXT, imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state_id, name)
);

CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), district_id UUID NOT NULL REFERENCES districts(id),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  settlement_type TEXT NOT NULL CHECK (settlement_type IN ('village','town','city','municipality','cantonment','other')),
  code TEXT, latitude NUMERIC(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  is_active BOOLEAN NOT NULL DEFAULT TRUE, source_id UUID REFERENCES location_sources(id),
  import_batch_id UUID REFERENCES import_batches(id), source_record_key TEXT, source_url TEXT,
  raw_payload_hash TEXT, imported_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (district_id, name, settlement_type)
);

CREATE TABLE localities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), settlement_id UUID REFERENCES settlements(id),
  district_id UUID NOT NULL REFERENCES districts(id), name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  locality_type TEXT NOT NULL DEFAULT 'locality' CHECK (locality_type IN ('locality','neighbourhood','ward','colony','sector','other')),
  code TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE, source_id UUID REFERENCES location_sources(id),
  import_batch_id UUID REFERENCES import_batches(id), source_record_key TEXT, source_url TEXT,
  raw_payload_hash TEXT, imported_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (district_id, name)
);

CREATE TABLE pincodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), country_id UUID NOT NULL REFERENCES countries(id),
  code TEXT NOT NULL CHECK (code ~ '^[0-9A-Za-z -]{3,12}$'), is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_id UUID REFERENCES location_sources(id), import_batch_id UUID REFERENCES import_batches(id),
  source_record_key TEXT, source_url TEXT, raw_payload_hash TEXT, imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_id, code)
);

CREATE TABLE post_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pincode_id UUID NOT NULL REFERENCES pincodes(id),
  district_id UUID REFERENCES districts(id), name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  office_type TEXT, code TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_id UUID REFERENCES location_sources(id), import_batch_id UUID REFERENCES import_batches(id),
  source_record_key TEXT, source_url TEXT, raw_payload_hash TEXT, imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pincode_id, name)
);

CREATE TABLE locality_pincodes (
  locality_id UUID NOT NULL REFERENCES localities(id) ON DELETE CASCADE,
  pincode_id UUID NOT NULL REFERENCES pincodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'serves' CHECK (relationship_type IN ('serves','contains','nearby','other')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE, source_id UUID REFERENCES location_sources(id),
  import_batch_id UUID REFERENCES import_batches(id), source_record_key TEXT, source_url TEXT,
  raw_payload_hash TEXT, imported_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (locality_id, pincode_id)
);

CREATE TABLE location_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID REFERENCES countries(id) ON DELETE CASCADE, state_id UUID REFERENCES states(id) ON DELETE CASCADE,
  district_id UUID REFERENCES districts(id) ON DELETE CASCADE, settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
  locality_id UUID REFERENCES localities(id) ON DELETE CASCADE, pincode_id UUID REFERENCES pincodes(id) ON DELETE CASCADE,
  post_office_id UUID REFERENCES post_offices(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(btrim(alias)) > 0), language_code TEXT,
  alias_type TEXT NOT NULL DEFAULT 'alternate' CHECK (alias_type IN ('alternate','historical','local_script','abbreviation','other')),
  source_id UUID REFERENCES location_sources(id), import_batch_id UUID REFERENCES import_batches(id),
  source_record_key TEXT, source_url TEXT, raw_payload_hash TEXT, imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(country_id,state_id,district_id,settlement_id,locality_id,pincode_id,post_office_id) = 1),
  UNIQUE (alias, language_code, country_id, state_id, district_id, settlement_id, locality_id, pincode_id, post_office_id)
);

CREATE INDEX import_batches_status_idx ON import_batches (status, created_at DESC);
CREATE INDEX states_country_idx ON states (country_id);
CREATE INDEX districts_state_idx ON districts (state_id);
CREATE INDEX settlements_district_idx ON settlements (district_id);
CREATE INDEX localities_settlement_idx ON localities (settlement_id);
CREATE INDEX localities_district_idx ON localities (district_id);
CREATE INDEX post_offices_pincode_idx ON post_offices (pincode_id);
CREATE INDEX locality_pincodes_pincode_idx ON locality_pincodes (pincode_id);
CREATE INDEX location_aliases_alias_idx ON location_aliases (lower(alias));
CREATE INDEX location_aliases_batch_idx ON location_aliases (source_id, import_batch_id);
