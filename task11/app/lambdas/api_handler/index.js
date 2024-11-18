const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({
    region: process.env.region
});


const dynamoDB = new AWS.DynamoDB.DocumentClient();
const reservationsTable = process.env.revtable
const tablesTable = process.env.tablestable

exports.handler = async (event) => {
    const userPoolId = process.env.CUPId;
    const clientId = process.env.CUPClientId;

    // Parse the request body
    let body = JSON.parse(event.body)

    console.log(body);
    console.log(event);


    // Handle `/signup` endpoint
    if (event.resource === '/signup' && event.httpMethod === 'POST') {
        console.log('THIS IS SIMG UP');

        const { email, password, firstName, lastName } = body;
        const params = {
            ClientId: clientId,
            Username: email,
            Password: password,
            UserAttributes: [{ Name: 'email', Value: email }],
            // MessageAction: "SUPPRESS", 
        };

        // const params = {
        //     ClientId:clientId,
        //     UserPoolId: userPoolId,
        //     Username: email,
        //     Password: password,
        //     MessageAction: "SUPPRESS", 
        //     UserAttributes: [
        //         { Name: 'email', Value: email },
        //         { Name: 'name', Value: firstName + lastName }
        //     ]
        // };
        try {
            const data = await cognitoIdentityServiceProvider.signUp(params).promise();
            const confirmParams = {
                Username: body.email,
                UserPoolId: userPoolId
            };
            const confirmedResult = await cognitoIdentityServiceProvider.adminConfirmSignUp(confirmParams).promise();

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "User created successfully" })
            };
        } catch (error) {
            console.log(error);

            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Signup failed", details: error.message })
            };
        }
    }

    // Handle `/signin` endpoint
    if (event.resource === '/signin' && event.httpMethod === 'POST') {
        const { email, password } = body;
        const params = {
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            UserPoolId: userPoolId,
            ClientId: clientId,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            }
        };

        try {
            const data = await cognitoIdentityServiceProvider.adminInitiateAuth(params).promise();
            console.log(data);

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accessToken: data.AuthenticationResult.IdToken ||
                        'blank'
                })
            };
        } catch (error) {
            console.log(error);

            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Authentication failed", details: error })
            };
        }
    }

    if (event.resource === '/tables' && event.httpMethod === 'GET') {
        const params = {
            TableName: tablesTable
        };
        try {
            const data = await dynamoDB.scan(params).promise();
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tables: data.Items }) // Returns all tables
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Failed to fetch tables", details: error.message })
            };
        }
    }


    if (event.resource === '/tables' && event.httpMethod === 'POST') {
        try {
            const params = {
                TableName: tablesTable,
                Item: body
            };
            await dynamoDB.put(params).promise()
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: body.id })
            };
        } catch (e) {
            console.log(e);
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "error" })
            };
        }

    }


    // Handle `/tables/{tableId}` resource for GET method
    if (event.resource === '/tables/{tableId}' && event.httpMethod === 'GET') {
        const tableId = event.pathParameters.tableId;
        const params = {
            TableName: tablesTable,
            Key: { id: parseInt(tableId) } // Assuming `id` is the primary key in the tablesTable
        };
        try {
            const data = await dynamoDB.get(params).promise();
            if (data.Item) {
                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...data.Item })
                };
            } else {
                return {
                    statusCode: 404,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Table not found" })
                };
            }
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Failed to fetch table data", details: error.message })
            };
        }
    }






    if (event.resource === '/reservations' && event.httpMethod === 'GET') {
        try {
            const params = { TableName: reservationsTable }
            const data = await dynamoDB.scan(params).promise()
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reservations: data.Items }) // Replace with actual data
            };
        } catch (e) {
            console.log(e);

            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: e.message
            }
        }

    }

    async function checkIfTableExists(tableNumber) {
        var params = {
            ExpressionAttributeValues: {
                ":tableNumber": parseInt(tableNumber)
            },
            FilterExpression: "number = :tableNumber",
            KeyConditionExpression: "number = :tableNumber",
            ProjectionExpression: "id, places",
            TableName: tablesTable,
        };

        const data = await dynamoDB.scan(params).promise();
        return data.Items.length > 0;
    }

    async function isTableExist(tableNumber) {
        const parsedTableNumber = parseInt(tableNumber)
        //we check if table exists here
        try {
            const response = await dynamoDB
                .scan({
                    TableName: tablesTable,
                    FilterExpression: "#number = :tableNumberValue",
                    ExpressionAttributeNames: {
                        "#number": "number", // Ensure "number" is the actual attribute name
                    },
                    ExpressionAttributeValues: {
                        ":tableNumberValue": parsedTableNumber
                    },
                })
                .promise();
            return response.Items.length > 0;

        } catch (error) {
            console.error("Error checking table existence:", error);
            return false;
        }
    }


    async function hasOverlappingReservation(reservationData) {
        try {
            const tableNumber = reservationData.tableNumber
            const response = await dynamoDB
                .scan({
                    TableName: reservationsTable,
                    ExpressionAttributeValues: {
                        ":tableNumberValue": parseInt(tableNumber)
                    },
                    FilterExpression: "tableNumber = :tableNumberValue",
                })
                .promise();
            for (const item of response.Items) {
                const existingStart = new Date(`${item.date} ${item.slotTimeStart}`).getTime();
                const existingEnd = new Date(`${item.date} ${item.slotTimeEnd}`).getTime();
                const newStart = new Date(`${reservationData.date} ${reservationData.slotTimeStart}`).getTime();
                const newEnd = new Date(`${reservationData.date} ${reservationData.slotTimeEnd}`).getTime();

                // Check if the time slots overlap
                if (newStart < existingEnd && newEnd > existingStart) {
                    return true; // Overlap detected
                }
            }

            return false; // No overlap
        } catch (e) {
            console.error(e);

            throw (e)
        }

    }



    if (event.resource === '/reservations' && event.httpMethod === 'POST') {
        try {
            // identify if table exists
            const tableExistence = await isTableExist(body.tableNumber)
            if (!tableExistence) {
                console.log('table do not exist');
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "table do not exist" })
                }
            }
            // identify if new reservation overlaping older
            const isOverlaping = await hasOverlappingReservation(body)
            if (isOverlaping) {
                console.log('You are overlapping reservation. Cancel');
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "You are overlapping reservation. Cancel" })
                }
            }

            const id = uuidv4();
            const params = {
                TableName: reservationsTable,
                Item: {
                    "id": id,
                    "tableNumber": body.tableNumber,
                    "clientName": body.clientName,
                    "phoneNumber": body.phoneNumber,
                    "date": body.date,
                    "slotTimeStart": body.slotTimeStart,
                    "slotTimeEnd": body.slotTimeEnd
                }
            };
            await dynamoDB.put(params).promise();
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reservationId: id })
            };
        } catch (e) {
            console.log(e);
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: e.message })
            };
        }
    }


    return {
        statusCode: 404,
        body: JSON.stringify({ message: "Resource not found" })
    };
};