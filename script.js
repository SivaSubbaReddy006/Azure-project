let cart = [];

function addToCart(name, price) {
    cart.push({
        name: name,
        price: price
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

                total += item.price;

                const itemElement = document.createElement("div");

                itemElement.innerHTML = `
                    <p>
                        <strong>${item.name}</strong>
                        - ₹${item.price}
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
        }
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCart();
}
