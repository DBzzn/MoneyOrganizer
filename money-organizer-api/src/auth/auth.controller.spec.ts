import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    findById: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      findById: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('revokes the authenticated token on logout', () => {
    const request = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        tokenId: 'token-1',
        tokenExpiresAt: 1_800_000_000,
      },
    } as Parameters<AuthController['logout']>[0];

    controller.logout(request);

    expect(authService.logout).toHaveBeenCalledWith(request.user);
  });
});
