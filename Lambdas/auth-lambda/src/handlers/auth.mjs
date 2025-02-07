import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

export async function register(event) {
    try {
        const body = JSON.parse(event.body);
        const { email, password, name, playerLevel } = body;

        if (!email || !password || !name || !playerLevel) {
            return createResponse(400, { message: 'All fields are required' });
        }

        const db = await connectToDatabase();
        const users = db.collection('users');

        const existingUser = await users.findOne({ email });
        if (existingUser) {
            return createResponse(409, { message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            email,
            password: hashedPassword,
            name,
            playerLevel,
            createdAt: new Date()
        };

        await users.insertOne(newUser);
        const token = jwt.sign(
            { userId: newUser._id, email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return createResponse(201, {
            message: 'User created successfully',
            token,
            user: {
                email: newUser.email,
                name: newUser.name,
                playerLevel: newUser.playerLevel
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        return createResponse(500, { message: 'Error creating user', error: error.message });
    }
}

export async function login(event) {
    try {
        console.log('Starting login process');
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return createResponse(400, { message: 'Email and password are required' });
        }

        const db = await connectToDatabase();
        const users = db.collection('users');

        const user = await users.findOne({ email });
        if (!user) {
            return createResponse(401, { message: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return createResponse(401, { message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return createResponse(200, {
            message: 'Login successful',
            token,
            user: {
                email: user.email,
                name: user.name,
                playerLevel: user.playerLevel
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return createResponse(500, { message: 'Error during login' });
    }
}