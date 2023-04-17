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

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
