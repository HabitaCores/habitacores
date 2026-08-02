CREATE TABLE "external_identity_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"provider_email" text,
	"provider_phone" text,
	"email_verified" boolean,
	"phone_verified" boolean,
	"authentication_method" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identity_links_provider_subject_unique" UNIQUE("provider","provider_subject"),
	CONSTRAINT "external_identity_links_id_uuid_v7_check" CHECK ((get_byte(uuid_send("external_identity_links"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("external_identity_links"."id"), 8) >> 6) = 2),
	CONSTRAINT "external_identity_links_provider_check" CHECK ("external_identity_links"."provider" in ('supabase')),
	CONSTRAINT "external_identity_links_provider_subject_check" CHECK (octet_length("external_identity_links"."provider_subject") > 0),
	CONSTRAINT "external_identity_links_authentication_method_check" CHECK ("external_identity_links"."authentication_method" is null or "external_identity_links"."authentication_method" in ('password', 'magic_link', 'oauth', 'otp', 'sso'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"display_name" text,
	"preferred_email" text,
	"preferred_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_id_uuid_v7_check" CHECK ((get_byte(uuid_send("users"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("users"."id"), 8) >> 6) = 2),
	CONSTRAINT "users_lifecycle_status_check" CHECK ("users"."lifecycle_status" in ('active', 'suspended', 'disabled')),
	CONSTRAINT "users_suspended_at_check" CHECK ("users"."lifecycle_status" <> 'suspended' or "users"."suspended_at" is not null),
	CONSTRAINT "users_disabled_at_check" CHECK ("users"."lifecycle_status" <> 'disabled' or "users"."disabled_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "external_identity_links" ADD CONSTRAINT "external_identity_links_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_identity_links_user_id_idx" ON "external_identity_links" USING btree ("user_id");