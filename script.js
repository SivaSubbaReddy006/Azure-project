let cart = [];

function addToCart(name, price) {
    const existingItem = cart.find(item => item.name === name);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            name: name,
            price: price,
            quantity: 1
        });
    }

    updateCart();

    alert(name + " added to cart!");
}

function updateCart() {
    const cartCount = document.getElementById("cart-count");
    const cartItems = document.getElementById("cart-items");
    const cartTotal = document.getElementById("cart-total");

    // Update cart count
    if (cartCount) {
        cartCount.textContent = cart.length;
    }

    // Display cart items
    if (cartItems) {

        if (cart.length === 0) {
    cartItems.innerHTML = "<p>Your cart is empty.</p>";
    cartTotal.textContent = 0;
    return;
}else {

            cartItems.innerHTML = "";

            let total = 0;

            cart.forEach((item, index) => {

total += item.price * item.quantity;
                const itemElement = document.createElement("div");
itemElement.innerHTML = `
    <p>
        <strong>${item.name}</strong>
        - ₹${item.price}

        <br>

        Quantity:
        <button onclick="decreaseQuantity(${index})">−</button>
        ${item.quantity}
        <button onclick="increaseQuantity(${index})">+</button>

        <br><br>

        <button onclick="removeFromCart(${index})">
            Remove
        </button>
    </p>
`;

                cartItems.appendChild(itemElement);
            });

            if (cartTotal) {
                cartTotal.textContent = total;
            }
            if (!document.getElementById("checkout-button")) {
    const checkoutButton = document.createElement("button");
    checkoutButton.id = "checkout-button";
    checkoutButton.textContent = "Checkout";
    checkoutButton.onclick = checkout;

    cartItems.appendChild(checkoutButton);
}
        }
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCart();
}
function increaseQuantity(index) {
    cart[index].quantity++;
    updateCart();
}

function decreaseQuantity(index) {
    if (cart[index].quantity > 1) {
        cart[index].quantity--;
        updateCart();
    }
}
function checkout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    let name = prompt("Enter your name:");

    if (!name) {
        return;
    }

    let phone = prompt("Enter your phone number:");

    if (!phone) {
        return;
    }

    let address = prompt("Enter your delivery address:");

    if (!address) {
        return;
    }
    
const order = {
    customer: name,
    phone: phone,
    address: address,
    items: cart,
    total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    date: new Date().toLocaleString()
};

const orders = JSON.parse(localStorage.getItem("orders")) || [];

orders.push(order);

localStorage.setItem("orders", JSON.stringify(orders));
localStorage.setItem("latestOrder", JSON.stringify(order));    cart = [];
updateCart();
    alert(
        "Order placed successfully!\n\n" +
        "Customer: " + name + "\n" +
        "Phone: " + phone + "\n" +
        "Address: " + address
    );
    
}



// Display latest order
function displayOrders() {
    const ordersContainer = document.getElementById("orders-container");

    if (!ordersContainer) {
        return;
    }

    const savedOrder = localStorage.getItem("latestOrder");

    if (!savedOrder) {
        ordersContainer.innerHTML = "<p>No orders placed yet.</p>";
        return;
    }

    const order = JSON.parse(savedOrder);

    let itemsHTML = "";

    order.items.forEach(item => {
        itemsHTML += `
            <p>
                <strong>${item.name}</strong>
                - ₹${item.price}
                × ${item.quantity}
            </p>
        `;
    });

    ordersContainer.innerHTML = `
        <div class="order-card">
            <h3>Order Details</h3>

            <p><strong>Customer:</strong> ${order.customer}</p>
            <p><strong>Phone:</strong> ${order.phone}</p>
            <p><strong>Address:</strong> ${order.address}</p>

            <h4>Products:</h4>
            ${itemsHTML}

            <p><strong>Total:</strong> ₹${order.total}</p>
            <p><strong>Order Date:</strong> ${order.date}</p>

            <p><strong>Status:</strong> Order Placed ✅</p>
        </div>
    `;
}

// Load orders when the page opens
displayOrders();
