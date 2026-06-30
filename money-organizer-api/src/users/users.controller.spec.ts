import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  const usersService = {
    create: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
    updatePreferences: jest.fn(),
    clearMyData: jest.fn(),
    deleteMyAccount: jest.fn(),
  };
  const authRequest = {
    user: {
      id: 'auth-user-1',
      email: 'auth@example.com',
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a user through the service', () => {
    const dto = {
      name: 'New User',
      email: 'new@example.com',
      password: 'strong-password',
    };

    controller.create(dto);

    expect(usersService.create).toHaveBeenCalledWith(dto);
  });

  it('updates the authenticated user profile using the token subject', () => {
    const dto = {
      name: 'Updated User',
      currentPassword: 'current-password',
    };

    controller.updateProfile(authRequest, dto);

    expect(usersService.updateProfile).toHaveBeenCalledWith('auth-user-1', dto);
  });

  it('updates the authenticated user password using the token subject', () => {
    const dto = {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    };

    controller.updatePassword(authRequest, dto);

    expect(usersService.updatePassword).toHaveBeenCalledWith('auth-user-1', dto);
  });

  it('updates the authenticated user preferences using the token subject', () => {
    const dto = {
      reserveTargetMonths: 9,
    };

    controller.updatePreferences(authRequest, dto);

    expect(usersService.updatePreferences).toHaveBeenCalledWith('auth-user-1', dto);
  });

  it('clears only the authenticated user data using the token subject', () => {
    const dto = {
      password: 'current-password',
    };

    controller.clearMyData(authRequest, dto);

    expect(usersService.clearMyData).toHaveBeenCalledWith('auth-user-1', dto);
  });

  it('deletes only the authenticated user account using the token subject', () => {
    const dto = {
      password: 'current-password',
    };

    controller.deleteMyAccount(authRequest, dto);

    expect(usersService.deleteMyAccount).toHaveBeenCalledWith('auth-user-1', dto);
  });
});
