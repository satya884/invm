const express = require('express');
const connection = require('../conn'); // Import the database connection

const router = express.Router();

// Best Selling Items
router.get('/best-selling', async (req, res) => {
    try {
        const [result] = await connection.query(`
            SELECT a.ItemID,b.ItemName, SUM(a.Quantity) AS TotalSold
            FROM Sales as a INNER JOIN Inventory as b 
            ON a.ItemID=b.ItemID 
            GROUP BY ItemID
            ORDER BY TotalSold DESC
            LIMIT 5;
        `);
        res.json(result);
    } catch (error) {
        console.error('Error fetching best selling items:', error);
        res.status(500).json({ error: 'Failed to fetch best selling items' });
    }
});

//inventory
router.get('/high-profit-margin', async (req, res) => {
    try {
        const [result] = await connection.query(`
            SELECT 
                ItemID,
                ItemName,
                CostPrice,
                SellingPrice,
                (SellingPrice - CostPrice) AS ProfitMargin
            FROM 
                Inventory
            ORDER BY 
                ProfitMargin DESC
            LIMIT 5;
        `);
        res.json(result);
    } catch (error) {
        console.error('Error fetching high profit margin items:', error);
        res.status(500).json({ error: 'Failed to fetch high profit margin items' });
    }
});


// Sales Per Month
router.get('/sales-per-month', async (req, res) => {
    try {
        const [result] = await connection.query(`
            SELECT DATE_FORMAT(SaleDate, '%Y-%m') AS Month, SUM(TotalRevenue) AS Revenue
            FROM Sales
            GROUP BY Month
            ORDER BY Month DESC;
        `);
        res.json(result);
    } catch (error) {
        console.error('Error fetching sales per month:', error);
        res.status(500).json({ error: 'Failed to fetch sales per month' });
    }
});

router.get('/sales-per-item', async (req, res) => {
    try {
        const [result] = await connection.query(`
            SELECT ItemID, TotalRevenue AS Revenue
            FROM Sales
        `);
        res.json(result);
    } catch (error) {
        console.error('Error fetching sales per month:', error);
        res.status(500).json({ error: 'Failed to fetch sales per month' });
    }
});

router.get('/most-profit-item', async (req, res) => {
    try {
        const [result] = await connection.query(`
            SELECT s.ItemID,i.ItemName, i.Description, SUM(s.TotalRevenue - (s.Quantity * v.Price)) AS Profit
            FROM Sales s
            JOIN Vendors v ON s.ItemID = v.ItemID
            JOIN Inventory i ON s.ItemID = i.ItemID
            GROUP BY s.ItemID
            ORDER BY Profit DESC
            LIMIT 1;
        `);
        res.json(result);
    } catch (error) {
        console.error('Error fetching profit for most selling item:', error);
        res.status(500).json({ error: 'Failed to fetch profit for most selling item' });
    }
});

router.get('/profit', async (req, res) => {
    try {
        const [result] = await connection.query(`
            SELECT SUM(a.TotalRevenue - (a.Quantity * b.Price)) AS TotalProfit
            FROM Sales a
            JOIN Vendors b ON a.ItemID = b.ItemID;
        `);
        res.json(result);
    } catch (error) {
        console.error('Error fetching profit:', error);
        res.status(500).json({ error: 'Failed to fetch profit' });
    }
});

router.get('/salesforce', async (req, res) => {
    try {
        const query = `
            SELECT 
                v.VendorID, 
                v.VendorName, 
                SUM(s.TotalRevenue) AS TotalRevenue
            FROM 
                Vendors v
            LEFT JOIN 
                Sales s ON v.ItemID = s.ItemID
            GROUP BY 
                v.VendorID, v.VendorName;
        `;

        // Execute the query using the MySQL connection
        const [result] = await connection.query(query);

        // Send the result as JSON response
        res.json(result);
    } catch (error) {
        console.error('Error fetching salesforce of vendors:', error);
        res.status(500).json({ error: 'Failed to fetch salesforce data' });
    }
});

router.get('/broken-items', async (req, res) => {
    try {
        const query = "select * from brokenItems"
        const [result] = await connection.query(query);
        res.json(result);
    } catch (error) {
        console.error('Error fetching broken items', error);
        res.status(500).json({ error: 'Failed to fetch broken items' });
    }
});

router.get('/all-items', async (req, res) => {
    try {
        const query = "select itemId,itemName,description,sellingPrice as price from inventory"
        const [result] = await connection.query(query);
        res.json(result);
    } catch (error) {
        console.error('Error fetching all items', error);
        res.status(500).json({ error: 'Failed to all items' });
    }
});
// Purchase Product
router.post('/purchase-product', async (req, res) => {
    const { userID, itemID, quantity } = req.body;

    try {
        // Check if the item exists and has sufficient stock
        const [item] = await connection.query('SELECT quantity FROM Inventory WHERE itemID = ?', [itemID]);
        if (item.length === 0) {
            return res.status(404).send('Item not found');
        }
        if (item[0].quantity < quantity) {
            return res.status(400).send('Insufficient stock');
        }
        
        // Deduct the quantity from inventory
        await connection.query('UPDATE Inventory SET quantity = quantity - ? WHERE itemID = ?', [quantity, itemID])
        
        // update the vendors itemID as we are giving demands for the items if in the inventory it goes<=5
        if (item[0].quantity-quantity <= 5) {
            await connection.query('UPDATE vendors set QuantitySupplied = QuantitySupplied + ? where itemID = ?', [30,itemID]) 
            await connection.query('UPDATE Inventory SET quantity = quantity + ? WHERE itemID = ?', [30, itemID])
        }
        
        const [amount] = await connection.query('SELECT sellingPrice FROM Inventory WHERE itemID = ?', [itemID])
        const totalAmount = amount[0].sellingPrice*quantity

        await connection.query(
            'UPDATE sales SET quantity = quantity + ?, totalrevenue = totalrevenue + ? WHERE itemID = ?',
            [quantity, totalAmount, itemID]
        );
        
        // Insert the new order
        const [result] = await connection.query(
            'INSERT INTO Orders (userID, itemID, quantity, TotalAmount, status) VALUES (?, ?, ?, ?, ?)',
            [userID, itemID, quantity, totalAmount, "purchased"]
        );
        res.status(201).json({"message": `Order placed successfully with ID: ${result.insertId} And TotalAmount ${totalAmount}`});
    } catch (err) {
        console.error('Error placing order:', err.message);
        res.status(500).json({"error": 'Internal server error'})
    }
});

router.post('/sell-product', async (req, res) => {
    const { userID, itemID, quantity } = req.body;

    try {
        // Check if the item exists and has sufficient stock
        const [item] = await connection.query('SELECT quantity FROM Inventory WHERE itemID = ?', [itemID]);
        if (item.length === 0) {
            return res.status(404).send('Item not found');
        }
        if (item[0].quantity < quantity) {
            return res.status(400).send('Insufficient stock');
        }
        
        // Deduct the quantity from inventory
        await connection.query('UPDATE Inventory SET quantity = quantity + ? WHERE itemID = ?', [quantity, itemID])
        
        
        const [amount] = await connection.query('SELECT sellingPrice FROM Inventory WHERE itemID = ?', [itemID])
        const totalAmount = amount[0].sellingPrice*quantity
        // Insert the new order
        const [result] = await connection.query(
            'INSERT INTO Orders (userID, itemID, quantity, TotalAmount, Status) VALUES (?, ?, ?, ?, ?)',
            [userID, itemID, quantity, totalAmount, 'sold']
        );
        res.status(201).json({"message": `Item successfully sold with ID: ${result.insertId} And TotalAmount ${totalAmount}`});
    } catch (err) {
        console.error('Error placing order:', err.message);
        res.status(500).json({"error": 'Internal server error'})
    }
});
module.exports = router;
