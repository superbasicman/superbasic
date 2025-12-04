/**
 * Profiles Domain
 *
 * Exports profile repository, service, errors, and types.
 */

export { ProfileRepository } from './profile-repository.js';
export type { CreateProfileData, UpdateProfileData } from './profile-repository.js';

export { ProfileService } from './profile-service.js';

export { ProfileError, ProfileNotFoundError, InvalidProfileDataError } from './profile-errors.js';

export { UpdateProfileSchema } from './profile-types.js';
export type {
  UpdateProfileInput,
  GetProfileParams,
  ProfileResponse,
  UpdateProfileParams,
  UpdateProfileData as ProfileUpdateData,
} from './profile-types.js';
