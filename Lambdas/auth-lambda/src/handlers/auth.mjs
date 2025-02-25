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

import { ObjectId } from 'mongodb';

export async function updateUser(event) {
    try {
        console.log('UpdateUser event:', JSON.stringify(event));

        const db = await connectToDatabase();
        const users = db.collection('users');

        // Extract authorization token
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', JSON.stringify(decoded));

        // Get the userId from the token
        const userId = decoded.userId;
        console.log('User ID from token:', userId);

        // Check the user in the database
        // Try both as string and ObjectId to be safe
        let user = await users.findOne({ _id: userId });

        if (!user) {
            // Try with ObjectId
            try {
                user = await users.findOne({ _id: new ObjectId(userId) });
            } catch (error) {
                console.error('Error converting to ObjectId:', error);
            }
        }

        if (!user) {
            console.log('User not found with ID:', userId);
            return createResponse(404, { message: 'User not found' });
        }

        console.log('User found:', user);

        const updates = JSON.parse(event.body);
        const allowedUpdates = ['name', 'email', 'playerLevel'];

        // Filter updates to only allow certain fields
        const filteredUpdates = Object.keys(updates)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = updates[key];
                return obj;
            }, {});

        console.log('Filtered updates:', JSON.stringify(filteredUpdates));

        if (Object.keys(filteredUpdates).length === 0) {
            return createResponse(400, { message: 'No valid update fields provided' });
        }

        // Use whatever ID format worked for finding the user
        const result = await users.updateOne(
            { _id: user._id },
            { $set: filteredUpdates }
        );

        console.log('DB update result:', JSON.stringify(result));

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'Update failed' });
        }

        // Get updated user to return in response
        const updatedUser = await users.findOne({ _id: user._id });

        return createResponse(200, {
            message: 'User updated successfully',
            user: {
                id: updatedUser._id.toString(),
                email: updatedUser.email,
                name: updatedUser.name,
                playerLevel: updatedUser.playerLevel
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error updating user', error: error.message });
    }
}

[HttpPost]
public async Task < IActionResult > UpdatePassword(SettingsViewModel model)
{
    try {
        var token = HttpContext.Session.GetString("JWTToken");
        if (string.IsNullOrEmpty(token)) {
            return RedirectToAction("Login", "Account");
        }

        if (string.IsNullOrEmpty(model.CurrentPassword) ||
            string.IsNullOrEmpty(model.NewPassword) ||
            string.IsNullOrEmpty(model.ConfirmNewPassword)) {
            ModelState.AddModelError("", "All password fields are required");
            return RedirectToAction(nameof(Index));
        }

        if (model.NewPassword != model.ConfirmNewPassword) {
            ModelState.AddModelError("", "New passwords do not match");
            return RedirectToAction(nameof(Index));
        }

        // Updated path to match API Gateway structure
        var request = new HttpRequestMessage(HttpMethod.Post, "auth/update-password");
        request.Headers.Add("Authorization", $"Bearer {token}");

        var requestBody = new
            {
                currentPassword = model.CurrentPassword,
                newPassword = model.NewPassword
            };

        request.Content = JsonContent.Create(requestBody);

        _logger.LogInformation("Sending password update request");
        _logger.LogInformation($"Authorization header: {request.Headers.GetValues("Authorization").FirstOrDefault()}");
        _logger.LogInformation($"Request body: {await request.Content.ReadAsStringAsync()}");

        var response = await _httpClient.SendAsync(request);
        var responseContent = await response.Content.ReadAsStringAsync();
        _logger.LogInformation($"Password update response status: {response.StatusCode}");
        _logger.LogInformation($"Password update response content: {responseContent}");

        if (response.IsSuccessStatusCode) {
            TempData["SuccessMessage"] = "Password updated successfully";
        }
        else {
            var error = await response.Content.ReadFromJsonAsync < ErrorResponse > ();
            ModelState.AddModelError("", error?.Message ?? "Failed to update password");
        }
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error updating password");
        ModelState.AddModelError("", "An error occurred while updating password");
    }
    return RedirectToAction(nameof(Index));
}