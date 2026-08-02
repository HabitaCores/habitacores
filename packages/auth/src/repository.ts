import type { IdentityLinkId, UserId } from './identifiers.js';
import type {
  AuthenticationMethod,
  ExternalIdentityLink,
  ExternalIdentityProvider,
  ExternalSubject,
  HabitacoresUser,
  ProviderIdentityObservations,
} from './types.js';

export interface NewUserWithIdentityLink {
  readonly user: HabitacoresUser;
  readonly identityLink: ExternalIdentityLink;
}

export interface SuccessfulIdentityObservation {
  readonly identityLinkId: IdentityLinkId;
  readonly authenticationMethod: AuthenticationMethod | null;
  readonly observedAt: Date;
}

export interface ProviderProfileObservationUpdate extends ProviderIdentityObservations {
  readonly identityLinkId: IdentityLinkId;
  readonly observedAt: Date;
}

export interface IdentityRepository {
  findUserById(userId: UserId): Promise<HabitacoresUser | null>;
  findIdentityLink(
    provider: ExternalIdentityProvider,
    subject: ExternalSubject,
  ): Promise<ExternalIdentityLink | null>;
  createUserWithIdentityLink(input: NewUserWithIdentityLink): Promise<NewUserWithIdentityLink>;
  recordSuccessfulIdentityObservation(input: SuccessfulIdentityObservation): Promise<void>;
  updateProviderProfileObservations(input: ProviderProfileObservationUpdate): Promise<void>;
  suspendUser(userId: UserId, suspendedAt: Date): Promise<HabitacoresUser | null>;
  disableUser(userId: UserId, disabledAt: Date): Promise<HabitacoresUser | null>;
}
