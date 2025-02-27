import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

// Get conversations for a user
export async function getConversations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const db = await connectToDatabase();
        const conversations = db.collection('conversations');
        const users = db.collection('users');

        // Find all conversations where the user is a participant
        const userConversations = await conversations.find({
            participants: userId
        }).sort({ lastMessageAt: -1 }).toArray();

        // Get other participant details for each conversation
        const result = [];

        for (const conversation of userConversations) {
            // Get the other participant's ID
            const otherParticipantId = conversation.participants.find(id => id !== userId);

            // Get other participant's details
            const otherParticipant = await users.findOne(
                { _id: new ObjectId(otherParticipantId) },
                { projection: { password: 0 } }
            );

            if (otherParticipant) {
                result.push({
                    conversationId: conversation._id,
                    otherUser: {
                        id: otherParticipant._id,
                        name: otherParticipant.name,
                        email: otherParticipant.email,
                        playerLevel: otherParticipant.playerLevel
                    },
                    lastMessageAt: conversation.lastMessageAt,
                    unreadCount: conversation.unreadCount?.[userId] || 0
                });
            }
        }

        return createResponse(200, { conversations: result });
    } catch (error) {
        console.error('Get conversations error:', error);
        return createResponse(500, { message: 'Error retrieving conversations' });
    }
}

// Get messages for a specific conversation
export async function getMessages(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const { conversationId } = event.pathParameters || {};

        if (!conversationId) {
            return createResponse(400, { message: 'conversationId is required' });
        }

        const db = await connectToDatabase();
        const conversations = db.collection('conversations');
        const messages = db.collection('messages');

        // Verify user is a participant in the conversation
        const conversation = await conversations.findOne({
            _id: new ObjectId(conversationId),
            participants: userId
        });

        if (!conversation) {
            return createResponse(404, { message: 'Conversation not found or not authorized' });
        }

        // Get messages
        const conversationMessages = await messages.find({
            conversationId: conversationId
        }).sort({ createdAt: 1 }).toArray();

        // Mark messages as read
        if (conversationMessages.some(msg => !msg.readBy?.includes(userId))) {
            await messages.updateMany(
                {
                    conversationId: conversationId,
                    senderId: { $ne: userId },
                    readBy: { $ne: userId }
                },
                { $addToSet: { readBy: userId } }
            );

            // Update unread count in conversation
            await conversations.updateOne(
                { _id: new ObjectId(conversationId) },
                {
                    $set: { [`unreadCount.${userId}`]: 0 },
                    $currentDate: { updatedAt: true }
                }
            );
        }

        return createResponse(200, { messages: conversationMessages });
    } catch (error) {
        console.error('Get messages error:', error);
        return createResponse(500, { message: 'Error retrieving messages' });
    }
}

// Send a message
export async function sendMessage(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const senderId = token.decoded.userId;
        const { recipientId, content, conversationId } = JSON.parse(event.body);

        if ((!recipientId && !conversationId) || !content) {
            return createResponse(400, { message: 'Either recipientId or conversationId, and content are required' });
        }

        const db = await connectToDatabase();
        const users = db.collection('users');
        const conversations = db.collection('conversations');
        const messages = db.collection('messages');

        let actualConversationId = conversationId;

        // If no conversationId provided, find or create conversation
        if (!actualConversationId) {
            // Verify recipient exists
            const recipientExists = await users.findOne({ _id: new ObjectId(recipientId) });
            if (!recipientExists) {
                return createResponse(404, { message: 'Recipient not found' });
            }

            // Check if conversation already exists
            const existingConversation = await conversations.findOne({
                participants: { $all: [senderId, recipientId] }
            });

            if (existingConversation) {
                actualConversationId = existingConversation._id.toString();
            } else {
                // Create new conversation
                const newConversation = {
                    participants: [senderId, recipientId],
                    lastMessageAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    unreadCount: {
                        [senderId]: 0,
                        [recipientId]: 0
                    }
                };

                const result = await conversations.insertOne(newConversation);
                actualConversationId = result.insertedId.toString();
            }
        } else {
            // Verify user is part of the conversation
            const conversation = await conversations.findOne({
                _id: new ObjectId(actualConversationId),
                participants: senderId
            });

            if (!conversation) {
                return createResponse(404, { message: 'Conversation not found or not authorized' });
            }

            // Get the recipient ID
            const recipientId = conversation.participants.find(id => id !== senderId);
        }

        // Create the message
        const newMessage = {
            conversationId: actualConversationId,
            senderId,
            content,
            readBy: [senderId], // Sender has read their own message
            createdAt: new Date()
        };

        const messageResult = await messages.insertOne(newMessage);

        // Update conversation's lastMessageAt and increment unread count for recipient
        await conversations.updateOne(
            { _id: new ObjectId(actualConversationId) },
            {
                $set: { lastMessageAt: new Date() },
                $inc: { [`unreadCount.${recipientId}`]: 1 },
                $currentDate: { updatedAt: true }
            }
        );

        return createResponse(201, {
            message: 'Message sent successfully',
            messageId: messageResult.insertedId,
            conversationId: actualConversationId
        });
    } catch (error) {
        console.error('Send message error:', error);
        return createResponse(500, { message: 'Error sending message' });
    }
}

// Helper function to extract and verify JWT token
function extractAndVerifyToken(event) {
    const authHeader = event.headers.Authorization ||
        event.headers.authorization ||
        event.headers['Authorization'] ||
        event.headers['authorization'];

    if (!authHeader) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'No authorization token provided' })
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid authorization format' })
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            isValid: true,
            decoded
        };
    } catch (error) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}