const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Firestore document listener
exports.sendNotificationOnActivityCreation =
    functions.firestore.document("activity/{activityId}")
        .onCreate((snapshot, context) => {
          // Log that the Cloud Function is triggered
          console.log("sendNotificationOnActivityCreation triggered");

          // Get the new activity data
          const activityData = snapshot.data();

          // Check if activity type is 'fromAdmin'
          if (activityData.category === "fromAdmin") {
            console.log("fromAdmin category");
            // Fetch all user tokens from Firestore
            // (assuming users collection has FCM tokens)
            const usersRef = admin.firestore().collection("users");
            return usersRef.get()
                .then((snapshot) => {
                  const tokens = [];
                  snapshot.forEach((doc) => {
                    const token = doc.data().fcm_token;
                    const name = doc.data().name;
                    if (token) {
                      tokens.push(token);
                      console.log(`Sending notification to user : ${name}`);
                    }
                  });

                  // Create Multicast message with notification payload
                  const message = {
                    notification: {
                      title: "New Activity",
                      body: "A new activity has been added.",
                    },
                    tokens: tokens,
                  };

                  // Send multicast message
                  return admin.messaging().sendEachForMulticast(message);
                });
          } else {
            // If activity type is not 'fromAdmin'
            // return null to exit the function
            return null;
          }
        });
