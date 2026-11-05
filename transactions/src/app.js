
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// Logging
console.log('Starting transactions service...');

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// MongoDB connection
const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017';
const client = new MongoClient(mongoUri);

async function connectToMongo() {
  try {
    console.log('Attempting MongoDB connection...');
    await client.connect();
    await client.db().command({ ping: 1 });
    console.log('Successfully connected to MongoDB!');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
}

connectToMongo();

// Get all transactions for the assignment test
// Use only with fictional test data in a local environment.
app.get('/api/transactions', async (req, res) => {
  try {
    const db = client.db('bank_app');

    const users = await db.collection('users').find(
      {},
      {
        projection: {
          first_name: 1,
          last_name: 1,
          transactions: 1
        }
      }
    ).toArray();

    const results = users.map(user => ({
      userId: user._id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      transactions: user.transactions || []
    }));

    res.json(results);

  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Get monthly transactions for a specific user
app.get('/api/transactions/:userId', async (req, res) => {
  console.log(`Handling request for user: ${req.params.userId}`);

  try {
    const db = client.db('bank_app');

    let userId;

    try {
      userId = new ObjectId(req.params.userId);
    } catch (err) {
      console.error('Invalid user ID format:', err);
      return res.status(400).json({
        error: 'Invalid user ID format'
      });
    }

    const user = await db.collection('users').findOne({
      _id: userId
    });

    if (!user) {
      console.log('User not found in database');
      return res.status(404).json({
        error: 'User not found'
      });
    }

    console.log(
      `Found user with ${user.transactions?.length || 0} transactions`
    );

    const transactions = await db.collection('users').aggregate([
      {
        $match: {
          _id: userId
        }
      },
      {
        $unwind: '$transactions'
      },
      {
        $addFields: {
          'transactions.date': {
            $cond: {
              if: {
                $eq: [
                  { $type: '$transactions.date' },
                  'string'
                ]
              },
              then: {
                $toDate: '$transactions.date'
              },
              else: '$transactions.date'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            month: {
              $month: '$transactions.date'
            },
            year: {
              $year: '$transactions.date'
            }
          },
          transactions: {
            $push: {
              type: '$transactions.type',
              amount: '$transactions.amount',
              date: '$transactions.date'
            }
          }
        }
      },
      {
        $sort: {
          '_id.year': -1,
          '_id.month': -1
        }
      }
    ]).toArray();

    console.log(`Returning ${transactions.length} transaction groups`);

    res.json(transactions);

  } catch (err) {
    console.error('Error processing request:', err);

    res.status(500).json({
      error: 'Server Error',
      details: err.message
    });
  }
});

// Start transactions service
app.listen(port, '0.0.0.0', () => {
  console.log(
    `Transactions service running on http://localhost:${port}`
  );
});
