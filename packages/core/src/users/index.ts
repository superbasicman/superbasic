/**
 * Users Domain
 * 
 * Exports for user management functionality
 */

export { UserRepository } from './user-repository.js';
export type { CreateUserData, CreateUserProfileData } from './user-repository.js';

export { UserService } from './user-service.js';
export type {
  RegisterUserParams,
  RegisterUserResult,
  UserProfileData,
} from './user-types.js';

export {
  UserError,
  DuplicateEmailError,
  InvalidEmailError,
  WeakPasswordError,
} from './user-errors.js';
