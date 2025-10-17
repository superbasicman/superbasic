import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RegisterSchema } from '@repo/types';
import { hashPassword, authEvents } from '@repo/auth';
import { prisma } from '@repo/database';

const registerRoute = new Hono();

registerRoute.post('/', zValidator('json', RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');

  // Normalize email to lowercase and trim
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user exists
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return c.json({ error: 'Email already in use' }, 409); // 409 Conflict
  }

  // Hash password and create user
  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      name: name ?? null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  // Emit user.registered event
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;
  authEvents.emit({
    type: 'user.registered',
    userId: user.id,
    email: user.email,
    ...(ip && { ip }),
  });

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
    },
    201
  );
});

export { registerRoute };
