import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";
import { MongoClient } from "mongodb";

// Configs
const PORT = 5000;
const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();

// Connect to Mongo
let db;
const mongoClient = new MongoClient(process.env.DATABASE_URL);

mongoClient
  .connect()
  .then(() => (db = mongoClient.db()))
  .catch((err) => console.error(err));

// Routes ----------------
// Post Participant route
app.post("/participants", async (req, res) => {
  const { name } = req.body;

  // Participant schema
  const participantSchema = joi.object({
    name: joi.string().required().min(1),
  });

  // Validations
  const bodyValidation = participantSchema.validate(req.body, {
    abortEarly: false,
  });
  if (bodyValidation.error) {
    const errors = bodyValidation.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  const userValidation = await db.collection("participants").findOne({ name });
  if (userValidation)
    return res.status(409).send("This user is already a participant");

  // New Participant Object
  const newUser = {
    name,
    lastStatus: Date.now(),
  };

  // Sucessful acess Object
  const sucessfulAcess = {
    from: name,
    to: "Todos",
    text: "entra na sala...",
    type: "status",
    time: dayjs().format("HH:mm:ss"),
  };

  // Tries to post the participant
  // If successful also posts a new participant message
  try {
    await db.collection("participants").insertOne(newUser);
    await db.collection("messages").insertOne(sucessfulAcess);
  } catch (err) {
    res.status(500).send(err.message);
  }

  return res.sendStatus(201);
});

// Get Participants route
app.get("/participants", async (req, res) => {
  try {
    const activeParticipants = await db
      .collection("participants")
      .find()
      .toArray();
    return res.send(activeParticipants);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Post participants messages route
app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  // Message Schema
  const messageSchema = joi.object({
    to: joi.string().required().min(1),
    text: joi.string().required().min(1),
    type: joi.string().required().valid("message", "private_message"),
  });

  // Validations
  // verifying if the user exists in the database
  try {
    const fromUser = await db
      .collection("participants")
      .findOne({ name: user });
    if (!fromUser)
      return res
        .status(422)
        .send("User doesn't exist on database or it's not logged");
  } catch (err) {
    res.status(500).send(err.message);
  }

  const messageValidation = messageSchema.validate(req.body, {
    abortEarly: false,
  });
  if (messageValidation.error) {
    const errors = messageValidation.error.details.map(
      (detail) => detail.message
    );
    return res.status(422).send(errors);
  }

  // Message Object
  const messageObject = {
    from: user,
    to,
    text,
    type,
    time: dayjs().format("HH:mm:ss"),
  };

  // Post the message to the database
  try {
    await db.collection("messages").insertOne(messageObject);
    return res.sendStatus(201);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

// Get participants messages route
// Limt param can be used
app.get("/messages", async (req, res) => {
  const { user } = req.headers;
  let messages = null;

  // Validate if the user is logged in
  try {
    const userLogged = await db
      .collection("participants")
      .findOne({ name: user });
    if (!userLogged) return res.status(422).send("User is not Online");
  } catch (err) {
    res.status(500).send(err.message);
  }

  // Get the messages that the user has access to
  try {
    messages = await db
      .collection("messages")
      .find({ $or: [{ from: user }, { to: user }, { to: "Todos" }] })
      .toArray();
  } catch (err) {
    res.status(500).send(err.message);
  }

  // Valdations
  if (!req.query.limit) return res.send(messages);
  else {
    let convertedLimit = Number(req.query.limit);

    if (convertedLimit <= 0 || isNaN(convertedLimit))
      return res.status(422).send("Limit parameter invalid");
    else return res.status(200).send(messages.slice(-convertedLimit));
  }
});

// Post status route
app.post("/status", async (req, res) => {
  const { user } = req.headers;

  // Validations
  const onlineUser = await db
    .collection("participants")
    .findOne({ name: user });
  if (!user || !onlineUser) return res.sendStatus(404);

  // Updates the lastStatus field
  try {
    const updatedLastStatus = { $set: { lastStatus: Date.now() } };
    await db
      .collection("participants")
      .updateOne(onlineUser, updatedLastStatus);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Verify the lastStatus field of all participants
// If the user is Away for too long it logs them out
// This function runs every 15 seconds
async function verifyOnlineParticipants() {
  const onlineParticipants = await db
    .collection("participants")
    .find()
    .toArray();

  for (let i = 0; i < onlineParticipants.length; i++) {
    if (Date.now() - onlineParticipants[i].lastStatus > 10000) {
      db.collection("participants").deleteOne({
        _id: onlineParticipants[i]._id,
      });

      const leftTheRoomMessage = {
        from: onlineParticipants[i].name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      };
      db.collection("messages").insertOne(leftTheRoomMessage);
    }
  }
}

setInterval(() => verifyOnlineParticipants(), 15000);

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
