// Add this modified version of updateUser that works with POST requests
export async function updateUser(event) {
    try {
        const db = await connectToDatabase();
        const users = db.collection('users');

        // Extract userId from token
        const { authorization } = event.headers;
        if (!authorization) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get userId from path parameters or body depending on the request type
        let userId = decoded.userId;

        // For PUT requests with path parameters
        if (event.pathParameters && event.pathParameters.id) {
            const { id } = event.pathParameters;
            // Verify the token userId matches the path parameter
            if (decoded.userId !== id && id !== 'me') {
                return createResponse(403, { message: 'Not authorized to update this user' });
            }
        }

        const updates = JSON.parse(event.body);
        const allowedUpdates = ['name', 'email', 'playerLevel'];

        // Filter updates to only allow certain fields
        const filteredUpdates = Object.keys(updates)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = updates[key];
                return obj;
            }, {});

        if (Object.keys(filteredUpdates).length === 0) {
            return createResponse(400, { message: 'No valid update fields provided' });
        }

        const result = await users.updateOne(
            { _id: decoded.userId },
            { $set: filteredUpdates }
        );

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'User not found' });
        }

        // Get updated user to return in response
        const updatedUser = await users.findOne({ _id: decoded.userId });

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
        return createResponse(500, { message: 'Error updating user' });
    }
}

// Similarly update the updatePassword function to work with POST
export async function updatePassword(event) {
    try {
        const db = await connectToDatabase();
        const users = db.collection('users');

        // Extract userId from token
        const { authorization } = event.headers;
        if (!authorization) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { currentPassword, newPassword } = JSON.parse(event.body);

        if (!currentPassword || !newPassword) {
            return createResponse(400, { message: 'Current password and new password are required' });
        }

        // Get user and verify current password
        const user = await users.findOne({ _id: decoded.userId });
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);

        if (!isValidPassword) {
            return createResponse(401, { message: 'Current password is incorrect' });
        }

        // Hash new password and update
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const result = await users.updateOne(
            { _id: decoded.userId },
            { $set: { password: hashedPassword } }
        );

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'User not found' });
        }

        return createResponse(200, { message: 'Password updated successfully' });
    } catch (error) {
        console.error('Update password error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error updating password' });
    }
}