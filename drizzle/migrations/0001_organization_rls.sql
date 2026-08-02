CREATE SCHEMA IF NOT EXISTS "habitacores";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "habitacores" FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION "habitacores"."current_organization_id"()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('habitacores.organization_id', true), '')::uuid
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "habitacores"."current_organization_id"() FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."properties" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."communities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."communities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."buildings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."blocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."floors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."floors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."units" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "organizations_organization_select"
ON "public"."organizations"
FOR SELECT
TO PUBLIC
USING ("id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "organizations_organization_insert"
ON "public"."organizations"
FOR INSERT
TO PUBLIC
WITH CHECK ("id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "organizations_organization_update"
ON "public"."organizations"
FOR UPDATE
TO PUBLIC
USING ("id" = "habitacores"."current_organization_id"())
WITH CHECK ("id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "organizations_organization_delete"
ON "public"."organizations"
FOR DELETE
TO PUBLIC
USING ("id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "properties_organization_select"
ON "public"."properties"
FOR SELECT
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "properties_organization_insert"
ON "public"."properties"
FOR INSERT
TO PUBLIC
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "properties_organization_update"
ON "public"."properties"
FOR UPDATE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"())
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "properties_organization_delete"
ON "public"."properties"
FOR DELETE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "communities_organization_select"
ON "public"."communities"
FOR SELECT
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "communities_organization_insert"
ON "public"."communities"
FOR INSERT
TO PUBLIC
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "communities_organization_update"
ON "public"."communities"
FOR UPDATE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"())
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "communities_organization_delete"
ON "public"."communities"
FOR DELETE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "buildings_organization_select"
ON "public"."buildings"
FOR SELECT
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "buildings_organization_insert"
ON "public"."buildings"
FOR INSERT
TO PUBLIC
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "buildings_organization_update"
ON "public"."buildings"
FOR UPDATE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"())
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "buildings_organization_delete"
ON "public"."buildings"
FOR DELETE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "blocks_organization_select"
ON "public"."blocks"
FOR SELECT
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "blocks_organization_insert"
ON "public"."blocks"
FOR INSERT
TO PUBLIC
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "blocks_organization_update"
ON "public"."blocks"
FOR UPDATE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"())
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "blocks_organization_delete"
ON "public"."blocks"
FOR DELETE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "floors_organization_select"
ON "public"."floors"
FOR SELECT
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "floors_organization_insert"
ON "public"."floors"
FOR INSERT
TO PUBLIC
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "floors_organization_update"
ON "public"."floors"
FOR UPDATE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"())
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "floors_organization_delete"
ON "public"."floors"
FOR DELETE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "units_organization_select"
ON "public"."units"
FOR SELECT
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "units_organization_insert"
ON "public"."units"
FOR INSERT
TO PUBLIC
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "units_organization_update"
ON "public"."units"
FOR UPDATE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"())
WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());
--> statement-breakpoint
CREATE POLICY "units_organization_delete"
ON "public"."units"
FOR DELETE
TO PUBLIC
USING ("organization_id" = "habitacores"."current_organization_id"());
