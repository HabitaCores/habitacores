CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_id_uuid_v7_check" CHECK ((get_byte(uuid_send("organizations"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("organizations"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "properties_id_uuid_v7_check" CHECK ((get_byte(uuid_send("properties"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("properties"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "communities_id_uuid_v7_check" CHECK ((get_byte(uuid_send("communities"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("communities"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buildings_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "buildings_id_uuid_v7_check" CHECK ((get_byte(uuid_send("buildings"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("buildings"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "blocks_id_uuid_v7_check" CHECK ((get_byte(uuid_send("blocks"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("blocks"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floors_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "floors_id_uuid_v7_check" CHECK ((get_byte(uuid_send("floors"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("floors"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"display_name" text,
	"reference_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "units_id_uuid_v7_check" CHECK ((get_byte(uuid_send("units"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("units"."id"), 8) >> 6) = 2)
);
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_property_tenant_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_community_tenant_fk" FOREIGN KEY ("organization_id","community_id") REFERENCES "public"."communities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_building_tenant_fk" FOREIGN KEY ("organization_id","building_id") REFERENCES "public"."buildings"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_block_tenant_fk" FOREIGN KEY ("organization_id","block_id") REFERENCES "public"."blocks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_floor_tenant_fk" FOREIGN KEY ("organization_id","floor_id") REFERENCES "public"."floors"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_organization_id_idx" ON "properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "communities_organization_property_idx" ON "communities" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX "buildings_organization_community_idx" ON "buildings" USING btree ("organization_id","community_id");--> statement-breakpoint
CREATE INDEX "blocks_organization_building_idx" ON "blocks" USING btree ("organization_id","building_id");--> statement-breakpoint
CREATE INDEX "floors_organization_block_idx" ON "floors" USING btree ("organization_id","block_id");--> statement-breakpoint
CREATE INDEX "units_organization_floor_idx" ON "units" USING btree ("organization_id","floor_id");
