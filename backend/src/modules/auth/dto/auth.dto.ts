export interface UserProfileDto {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface PasswordResetRequestDto {
  email: string;
}

export interface PasswordResetResponseDto {
  emailSent: boolean;
  needsRegistration?: boolean;
  devLink?: string;
}
