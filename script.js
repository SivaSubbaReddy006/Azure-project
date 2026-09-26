let cart = [];

function addToCart(name, price) {
    cart.push({
        name: name,
        price: price,
        quantity: 1
    });

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

    alert(
        "Order placed successfully!\n\n" +
        "Customer: " + name + "\n" +
        "Phone: " + phone + "\n" +
        "Address: " + address
    );
}
