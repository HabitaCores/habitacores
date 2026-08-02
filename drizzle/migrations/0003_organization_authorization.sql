CREATE TABLE "membership_role_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role_assignments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_role_assignments_id_uuid_v7_check" CHECK ((get_byte(uuid_send("membership_role_assignments"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("membership_role_assignments"."id"), 8) >> 6) = 2),
	CONSTRAINT "membership_role_assignments_lifecycle_status_check" CHECK ("membership_role_assignments"."lifecycle_status" in ('active', 'revoked')),
	CONSTRAINT "membership_role_assignments_lifecycle_timestamps_check" CHECK (("membership_role_assignments"."lifecycle_status" = 'active' and "membership_role_assignments"."revoked_at" is null) or ("membership_role_assignments"."lifecycle_status" = 'revoked' and "membership_role_assignments"."revoked_at" is not null and "membership_role_assignments"."revoked_at" >= "membership_role_assignments"."assigned_at"))
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_user_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "organization_memberships_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_memberships_id_uuid_v7_check" CHECK ((get_byte(uuid_send("organization_memberships"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("organization_memberships"."id"), 8) >> 6) = 2),
	CONSTRAINT "organization_memberships_status_check" CHECK ("organization_memberships"."status" in ('invited', 'active', 'suspended', 'revoked')),
	CONSTRAINT "organization_memberships_lifecycle_timestamps_check" CHECK (("organization_memberships"."status" = 'invited' and "organization_memberships"."activated_at" is null and "organization_memberships"."suspended_at" is null and "organization_memberships"."revoked_at" is null)
        or ("organization_memberships"."status" = 'active' and "organization_memberships"."activated_at" is not null and "organization_memberships"."suspended_at" is null and "organization_memberships"."revoked_at" is null)
        or ("organization_memberships"."status" = 'suspended' and "organization_memberships"."activated_at" is not null and "organization_memberships"."suspended_at" is not null and "organization_memberships"."revoked_at" is null)
        or ("organization_memberships"."status" = 'revoked' and "organization_memberships"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code"),
	CONSTRAINT "permissions_id_uuid_v7_check" CHECK ((get_byte(uuid_send("permissions"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("permissions"."id"), 8) >> 6) = 2),
	CONSTRAINT "permissions_code_check" CHECK ("permissions"."code" = lower(trim("permissions"."code")) and "permissions"."code" ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$' and position('*' in "permissions"."code") = 0),
	CONSTRAINT "permissions_display_name_check" CHECK (octet_length(trim("permissions"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id","granted_at"),
	CONSTRAINT "role_permissions_timestamps_check" CHECK ("role_permissions"."revoked_at" is null or "role_permissions"."revoked_at" >= "role_permissions"."granted_at")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"is_system_role" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "roles_organization_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "roles_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "roles_id_uuid_v7_check" CHECK ((get_byte(uuid_send("roles"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("roles"."id"), 8) >> 6) = 2),
	CONSTRAINT "roles_code_check" CHECK ("roles"."code" = lower(trim("roles"."code")) and "roles"."code" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "roles_display_name_check" CHECK (octet_length(trim("roles"."display_name")) > 0),
	CONSTRAINT "roles_lifecycle_status_check" CHECK ("roles"."lifecycle_status" in ('active', 'disabled')),
	CONSTRAINT "roles_disabled_at_check" CHECK (("roles"."lifecycle_status" = 'active' and "roles"."disabled_at" is null) or ("roles"."lifecycle_status" = 'disabled' and "roles"."disabled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_membership_tenant_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_role_tenant_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_role_assignments_active_unique" ON "membership_role_assignments" USING btree ("organization_id","membership_id","role_id") WHERE "membership_role_assignments"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "membership_role_assignments_organization_membership_idx" ON "membership_role_assignments" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX "membership_role_assignments_organization_role_idx" ON "membership_role_assignments" USING btree ("organization_id","role_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "permissions_code_idx" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_active_unique" ON "role_permissions" USING btree ("role_id","permission_id") WHERE "role_permissions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "roles_organization_id_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint

INSERT INTO "permissions" ("id", "code", "display_name") VALUES
  ('01890f47-6c8a-7601-8a21-9b7c1d2e3601', 'organization.read', 'Read organization'),
  ('01890f47-6c8a-7602-8a21-9b7c1d2e3602', 'organization.manage', 'Manage organization'),
  ('01890f47-6c8a-7603-8a21-9b7c1d2e3603', 'membership.read', 'Read memberships'),
  ('01890f47-6c8a-7604-8a21-9b7c1d2e3604', 'membership.manage', 'Manage memberships'),
  ('01890f47-6c8a-7605-8a21-9b7c1d2e3605', 'property.read', 'Read properties'),
  ('01890f47-6c8a-7606-8a21-9b7c1d2e3606', 'property.manage', 'Manage properties');--> statement-breakpoint

ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."organization_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."roles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."membership_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."membership_role_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."role_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "organization_memberships_organization_select"
  ON "public"."organization_memberships" FOR SELECT
  USING ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "organization_memberships_organization_insert"
  ON "public"."organization_memberships" FOR INSERT
  WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "organization_memberships_organization_update"
  ON "public"."organization_memberships" FOR UPDATE
  USING ("organization_id" = "habitacores"."current_organization_id"())
  WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "organization_memberships_organization_delete"
  ON "public"."organization_memberships" FOR DELETE
  USING ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint

CREATE POLICY "roles_organization_select"
  ON "public"."roles" FOR SELECT
  USING ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "roles_organization_insert"
  ON "public"."roles" FOR INSERT
  WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "roles_organization_update"
  ON "public"."roles" FOR UPDATE
  USING ("organization_id" = "habitacores"."current_organization_id"())
  WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "roles_organization_delete"
  ON "public"."roles" FOR DELETE
  USING ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint

CREATE POLICY "membership_role_assignments_organization_select"
  ON "public"."membership_role_assignments" FOR SELECT
  USING ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "membership_role_assignments_organization_insert"
  ON "public"."membership_role_assignments" FOR INSERT
  WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "membership_role_assignments_organization_update"
  ON "public"."membership_role_assignments" FOR UPDATE
  USING ("organization_id" = "habitacores"."current_organization_id"())
  WITH CHECK ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint
CREATE POLICY "membership_role_assignments_organization_delete"
  ON "public"."membership_role_assignments" FOR DELETE
  USING ("organization_id" = "habitacores"."current_organization_id"());--> statement-breakpoint

CREATE POLICY "role_permissions_organization_select"
  ON "public"."role_permissions" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "public"."roles"
    WHERE "roles"."id" = "role_permissions"."role_id"
      AND "roles"."organization_id" = "habitacores"."current_organization_id"()
  ));--> statement-breakpoint
CREATE POLICY "role_permissions_organization_insert"
  ON "public"."role_permissions" FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "public"."roles"
    WHERE "roles"."id" = "role_permissions"."role_id"
      AND "roles"."organization_id" = "habitacores"."current_organization_id"()
  ));--> statement-breakpoint
CREATE POLICY "role_permissions_organization_update"
  ON "public"."role_permissions" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "public"."roles"
    WHERE "roles"."id" = "role_permissions"."role_id"
      AND "roles"."organization_id" = "habitacores"."current_organization_id"()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "public"."roles"
    WHERE "roles"."id" = "role_permissions"."role_id"
      AND "roles"."organization_id" = "habitacores"."current_organization_id"()
  ));--> statement-breakpoint
CREATE POLICY "role_permissions_organization_delete"
  ON "public"."role_permissions" FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "public"."roles"
    WHERE "roles"."id" = "role_permissions"."role_id"
      AND "roles"."organization_id" = "habitacores"."current_organization_id"()
  ));
