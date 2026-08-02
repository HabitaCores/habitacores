CREATE TABLE "authentication_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lookup_digest" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"authentication_method" text NOT NULL,
	"assurance_level" text DEFAULT 'single_factor' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"replaced_by_session_id" uuid,
	"ip_hash" text,
	"user_agent_hash" text,
	CONSTRAINT "authentication_sessions_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "authentication_sessions_lookup_digest_unique" UNIQUE("lookup_digest"),
	CONSTRAINT "authentication_sessions_id_uuid_v7_check" CHECK ((get_byte(uuid_send("authentication_sessions"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("authentication_sessions"."id"), 8) >> 6) = 2),
	CONSTRAINT "authentication_sessions_status_check" CHECK ("authentication_sessions"."status" in ('active', 'revoked', 'expired')),
	CONSTRAINT "authentication_sessions_method_check" CHECK ("authentication_sessions"."authentication_method" in ('password', 'magic_link', 'oauth', 'otp', 'sso')),
	CONSTRAINT "authentication_sessions_assurance_check" CHECK ("authentication_sessions"."assurance_level" in ('single_factor', 'multi_factor')),
	CONSTRAINT "authentication_sessions_expiration_check" CHECK ("authentication_sessions"."created_at" <= "authentication_sessions"."last_seen_at" and "authentication_sessions"."created_at" < "authentication_sessions"."expires_at" and "authentication_sessions"."expires_at" <= "authentication_sessions"."absolute_expires_at" and "authentication_sessions"."last_seen_at" <= "authentication_sessions"."absolute_expires_at"),
	CONSTRAINT "authentication_sessions_revocation_check" CHECK (("authentication_sessions"."status" = 'active' and "authentication_sessions"."revoked_at" is null and "authentication_sessions"."revocation_reason" is null and "authentication_sessions"."replaced_by_session_id" is null)
        or ("authentication_sessions"."status" = 'revoked' and "authentication_sessions"."revoked_at" is not null and "authentication_sessions"."revocation_reason" is not null and "authentication_sessions"."revoked_at" >= "authentication_sessions"."created_at")
        or ("authentication_sessions"."status" = 'expired' and "authentication_sessions"."revoked_at" is not null and "authentication_sessions"."revocation_reason" = 'expired' and "authentication_sessions"."replaced_by_session_id" is null))
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"enrollment_id" uuid NOT NULL,
	"challenge_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer NOT NULL,
	CONSTRAINT "mfa_challenges_id_uuid_v7_check" CHECK ((get_byte(uuid_send("mfa_challenges"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("mfa_challenges"."id"), 8) >> 6) = 2),
	CONSTRAINT "mfa_challenges_type_check" CHECK ("mfa_challenges"."challenge_type" in ('totp', 'recovery_code')),
	CONSTRAINT "mfa_challenges_status_check" CHECK ("mfa_challenges"."status" in ('pending', 'verified', 'failed', 'expired')),
	CONSTRAINT "mfa_challenges_expiration_check" CHECK ("mfa_challenges"."expires_at" > "mfa_challenges"."created_at"),
	CONSTRAINT "mfa_challenges_attempts_check" CHECK ("mfa_challenges"."maximum_attempts" between 1 and 10 and "mfa_challenges"."attempt_count" between 0 and "mfa_challenges"."maximum_attempts"),
	CONSTRAINT "mfa_challenges_verification_check" CHECK (("mfa_challenges"."status" = 'verified' and "mfa_challenges"."verified_at" is not null)
        or ("mfa_challenges"."status" <> 'verified' and "mfa_challenges"."verified_at" is null))
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"enrollment_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "mfa_recovery_codes_pk" PRIMARY KEY("enrollment_id","code_hash"),
	CONSTRAINT "mfa_recovery_codes_hash_check" CHECK (octet_length("mfa_recovery_codes"."code_hash") > 0),
	CONSTRAINT "mfa_recovery_codes_used_at_check" CHECK ("mfa_recovery_codes"."used_at" is null or "mfa_recovery_codes"."used_at" >= "mfa_recovery_codes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "totp_enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_key_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "totp_enrollments_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "totp_enrollments_id_uuid_v7_check" CHECK ((get_byte(uuid_send("totp_enrollments"."id"), 6) >> 4) = 7 and (get_byte(uuid_send("totp_enrollments"."id"), 8) >> 6) = 2),
	CONSTRAINT "totp_enrollments_status_check" CHECK ("totp_enrollments"."status" in ('pending', 'active', 'disabled')),
	CONSTRAINT "totp_enrollments_key_version_check" CHECK ("totp_enrollments"."secret_key_version" > 0),
	CONSTRAINT "totp_enrollments_ciphertext_check" CHECK (octet_length("totp_enrollments"."secret_ciphertext") > 0),
	CONSTRAINT "totp_enrollments_lifecycle_check" CHECK (("totp_enrollments"."status" = 'pending' and "totp_enrollments"."verified_at" is null and "totp_enrollments"."disabled_at" is null)
        or ("totp_enrollments"."status" = 'active' and "totp_enrollments"."verified_at" is not null and "totp_enrollments"."disabled_at" is null)
        or ("totp_enrollments"."status" = 'disabled' and "totp_enrollments"."disabled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "authentication_sessions" ADD CONSTRAINT "authentication_sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_sessions" ADD CONSTRAINT "authentication_sessions_replacement_fk" FOREIGN KEY ("replaced_by_session_id","user_id") REFERENCES "public"."authentication_sessions"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_session_user_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."authentication_sessions"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_enrollment_user_fk" FOREIGN KEY ("enrollment_id","user_id") REFERENCES "public"."totp_enrollments"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_enrollment_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."totp_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_enrollments" ADD CONSTRAINT "totp_enrollments_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authentication_sessions_user_status_idx" ON "authentication_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "authentication_sessions_active_lookup_idx" ON "authentication_sessions" USING btree ("lookup_digest") WHERE "authentication_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "mfa_challenges_user_status_idx" ON "mfa_challenges" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "mfa_challenges_session_idx" ON "mfa_challenges" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_unused_idx" ON "mfa_recovery_codes" USING btree ("enrollment_id","used_at");--> statement-breakpoint
CREATE UNIQUE INDEX "totp_enrollments_user_current_unique" ON "totp_enrollments" USING btree ("user_id") WHERE "totp_enrollments"."status" in ('pending', 'active');--> statement-breakpoint
CREATE INDEX "totp_enrollments_user_status_idx" ON "totp_enrollments" USING btree ("user_id","status");