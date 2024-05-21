const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4b15k66.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    client.connect();

    const userCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const cartCollection = client.db("bistroDB").collection("cart");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // jwt realted api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_TOKEN, {
        expiresIn: "1hr",
      });
      res.send({ token });
    });

    // middlewares

    const verifyToken = (req, res, next) => {
      if (!req.headers?.authorization) {
        return res.status(401).send({ message: "unauthorized  access" });
      }
      const token = req.headers?.authorization.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      jwt.verify(token, process.env.SECRET_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(403).send({ message: "unauthorized access" });
        }
        req.user = decoded;
        next();
      });
    };

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === "admin";
      }
      res.send({ admin });
    });

    // user verify admin after verifytoken
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const query = {
          $or: [{ _id: id }, { _id: new ObjectId(id) }],
        };
        const result = await menuCollection.deleteOne(query);
        res.send(result);
        console.log(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };

        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // menu related api
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = {
          $or: [{ _id: id }, { _id: new ObjectId(id) }],
        };
        const result = await menuCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.patch("/menu/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = {
        $or: [{ _id: id }, { _id: id }],
      };
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // create carts collection
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        console.log(amount, "amount inside the intent");
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      try {
        const query = { email: req.params.email };
        if (req.params.email !== req.user.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    // payment related api

    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;
        const paymentResult = await paymentCollection.insertOne(payment);
        console.log("payment info", payment);

        const query = {
          _id: {
            $in: payment.cartIds.map((id) => new ObjectId(id)),
          },
        };
        const deleteResult = await cartCollection.deleteMany(query);

        res.send({
          paymentResult,
          deleteResult,
        });
      } catch (error) {
        console.error("Error processing payment:", error);
        res
          .status(500)
          .send({ error: "An error occurred while processing the payment." });
      }
    });

    // stats or analytics calculate total revenue
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({ users, menuItems, orders, revenue });
    });

    // using aggregate pipeline count total item sell and each category sell and revenue per category

    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await paymentCollection
          .aggregate([
            {
              $unwind: "$menuItemIds",
            },
            {
              $lookup: {
                from: "menu",
                localField: "menuItemIds",
                foreignField: "_id",
                as: "menuItems",
              },
            },
            {
              $unwind: "$menuItems",
            },
            {
              $group: {
                _id: "$menuItems.category",
                quantity: { $sum: 1 },
                revenue: { $sum: "$menuItems.price" },
              },
            },
            {
              $project: {
                _id: 0,
                category: "$_id",
                quantity: "$quantity",
                revenue: "$revenue",
              },
            },
          ])
          .toArray();
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("bistro boss is running");
});

app.listen(port, () => {
  console.log(`Bistro boss is running on server ${port}`);
});
