// src/handlers/courts.mjs
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

export async function getCourts(event) {
    try {
        const db = await connectToDatabase();
        const courts = db.collection('courts');

        // Get search parameters if they exist
        const { query, lat, lng, radius } = event.queryStringParameters || {};
        let findQuery = {};

        if (query) {
            findQuery = {
                $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { location: { $regex: query, $options: 'i' } }
                ]
            };
        } else if (lat && lng) {
            // If coordinates are provided, find courts within radius (default 10km)
            const searchRadius = radius ? parseFloat(radius) : 10;
            findQuery = {
                coordinates: {
                    $geoWithin: {
                        $centerSphere: [[parseFloat(lng), parseFloat(lat)], searchRadius / 6371] // radius in radians
                    }
                }
            };
        }

        const courtList = await courts.find(findQuery)
            .sort({ name: 1 })
            .toArray();

        return createResponse(200, { courts: courtList });
    } catch (error) {
        console.error('Get courts error:', error);
        return createResponse(500, { message: 'Error retrieving courts' });
    }
}

export async function searchNearby(event) {
    try {
        const db = await connectToDatabase();
        const courts = db.collection('courts');

        const { lat, lng, radius = 10 } = event.queryStringParameters || {};

        if (!lat || !lng) {
            return createResponse(400, { message: 'Latitude and longitude required' });
        }

        const nearCourts = await courts.find({
            coordinates: {
                $geoWithin: {
                    $centerSphere: [[parseFloat(lng), parseFloat(lat)], parseFloat(radius) / 6371]
                }
            }
        }).toArray();

        return createResponse(200, { courts: nearCourts });
    } catch (error) {
        console.error('Search nearby courts error:', error);
        return createResponse(500, { message: 'Error searching nearby courts' });
    }
}