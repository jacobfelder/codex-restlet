SELECT top 5 
	id, tranid
        FROM transaction
        WHERE type = 'VendBill'
        ORDER BY id DESC

