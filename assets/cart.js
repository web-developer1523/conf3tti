class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  onChange(event) {
    this.updateQuantity(event.target.dataset.index, event.target.value, document.activeElement.getAttribute('name'));
  }

  onCartUpdate() {
    fetch(`${routes.cart_url}?section_id=main-cart-items`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const sourceQty = html.querySelector('cart-items');
        this.innerHTML = sourceQty.innerHTML;
      })
      .catch((e) => {
        console.error(e);
      });
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, name) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement =
          document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
        const items = document.querySelectorAll('.cart-item');

        if (parsedState.errors) {
          quantityElement.value = quantityElement.getAttribute('value');
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        const errorsEl = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errorsEl) errorsEl.textContent = '';

        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        const cartFooter = document.getElementById('main-cart-footer');

        if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

        const sections = parsedState.sections || {};
        this.getSectionsToRender().forEach((section) => {
          const sectionHtml = sections[section.section];
          if (!sectionHtml) return;
          const container = document.getElementById(section.id);
          if (!container) return;
          const elementToReplace = container.querySelector(section.selector) || container;
          const innerHtml = this.getSectionInnerHTML(sectionHtml, section.selector);
          if (innerHtml != null) elementToReplace.innerHTML = innerHtml;
        });
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';
        if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined') {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
          }
        }
        this.updateLiveRegions(line, message);

        const lineItem =
          document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper
            ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
            : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
        } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
        }
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items' });
      })
      .catch(() => {
        this.querySelectorAll('.loading-overlay').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').innerHTML = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector(selector);
    return el ? el.innerHTML : '';
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading-overlay`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading-overlay`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading-overlay`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading-overlay`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'change',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}
// function refreshCartDrawer() {
//   fetch('/cart?view=drawer') // "drawer" is a cart drawer template
//     .then(response => response.text())
//     .then(html => {
//       const parser = new DOMParser();
//       const doc = parser.parseFromString(html, 'text/html');
//       const drawerContent = doc.querySelector('.cart-drawer'); // your drawer container
//       const currentDrawer = document.querySelector('.cart-drawer');

//       if (drawerContent && currentDrawer) {
//         currentDrawer.innerHTML = drawerContent.innerHTML;
//       }

//       // Update cart count or totals if needed
//       const cartCount = doc.querySelector('.cart-count')?.textContent;
//       const cartCountElem = document.querySelector('.cart-count');
//       if (cartCountElem && cartCount) cartCountElem.textContent = cartCount;
//     })
//     .catch(err => console.error('Failed to refresh cart drawer:', err));
// }

// // Listen for cart updates and refresh drawer
// document.addEventListener("cart:updated", refreshCartDrawer);
// document.addEventListener("ajaxCart:rendered", refreshCartDrawer);

// // Optional: refresh drawer when items removed or quantity changed
// document.body.addEventListener("click", e => {
//   if (e.target.matches('.cart__remove, .cart-remove, button[name="remove"], a[href*="cart/change"]')) {
//     setTimeout(refreshCartDrawer, 300);
//   }
// });

// document.body.addEventListener("change", e => {
//   if (e.target.matches('input[name="updates[]"], input.qty, input.cart__qty')) {
//     setTimeout(refreshCartDrawer, 300);
//   }
// });






// giftboxquantity

//free-gift box

// document.addEventListener("DOMContentLoaded", function () {
//   const freeGiftVariantId = 50835170689322;
//   const QTY_THRESHOLD = 2;

//   let isProcessing = false;
//   let reloadTimer = null;
//   let reloadCount = 0;
//   let finalReloadScheduled = false;

//   /* ------------------------------
//      FETCH OVERRIDE (cart detection)
//   -------------------------------- */
//   (function () {
//     const originalFetch = window.fetch;
//     window.fetch = function (resource, options) {
//       const isCartChange =
//         typeof resource === "string" &&
//         (resource.includes("/cart/add") ||
//          resource.includes("/cart/change"));

//       return originalFetch(resource, options).then(response => {
//         if (isCartChange) {
//           document.dispatchEvent(new Event("cart:updated"));
//         }
//         return response;
//       });
//     };
//   })();

//   /* ------------------------------
//      CART CHECK LOGIC
//   -------------------------------- */
//   function checkCartForGift() {
//     if (isProcessing) return;
//     isProcessing = true;

//     fetch("/cart.js")
//       .then(res => res.json())
//       .then(cart => {
//         const qualifyingQty = cart.items
//           .filter(item => item.variant_id !== freeGiftVariantId)
//           .reduce((sum, item) => sum + item.quantity, 0);

//         const giftItem = cart.items.find(
//           item => item.variant_id === freeGiftVariantId
//         );

//         const hasGift = !!giftItem;

//         /* ➖ REMOVE GIFT + DOUBLE RELOAD */
//         if (qualifyingQty < QTY_THRESHOLD && hasGift) {
//           removeGiftFromCart(giftItem.key).then(() => {
//             performDoubleReload();
//             finalReloadScheduled = true;
//           });
//           return;
//         }

//         /* ➕ ADD GIFT (NO RELOAD) */
//         if (qualifyingQty >= QTY_THRESHOLD && !hasGift) {
//           addGiftToCart().then(() => {
//             document.dispatchEvent(new Event("cart:gift-added"));
//           });
//           return;
//         }
//       })
//       .finally(() => {
//         isProcessing = false;
//       });
//   }

//   /* ------------------------------
//      CART ACTIONS
//   -------------------------------- */
//   function addGiftToCart() {
//     return fetch("/cart/add.js", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         items: [{ id: freeGiftVariantId, quantity: 1 }]
//       })
//     });
//   }

//   function removeGiftFromCart(itemKey) {
//     return fetch("/cart/change.js", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ id: itemKey, quantity: 0 })
//     });
//   }

//   /* ------------------------------
//      RELOAD LOGIC (REMOVAL ONLY)
//   -------------------------------- */
//   function performDoubleReload() {
//     reloadCount = 0;
//     doReload();
//   }

//   function doReload() {
//     reloadCount++;
//     clearTimeout(reloadTimer);

//     if (reloadCount <= 2) {
//       reloadTimer = setTimeout(() => {
//         window.location.reload();
//       }, reloadCount === 1 ? 500 : 1000);
//     }
//   }

//   function scheduleFinalReload() {
//     if (finalReloadScheduled) {
//       clearTimeout(reloadTimer);
//       reloadTimer = setTimeout(() => {
//         window.location.reload();
//       }, 1500);
//       finalReloadScheduled = false;
//     }
//   }

//   /* ------------------------------
//      EVENT HANDLING
//   -------------------------------- */
//   document.addEventListener("cart:updated", () => {
//     setTimeout(checkCartForGift, 200);
//     scheduleFinalReload();
//   });

//   /* ❌ NO reload when gift qty changes */
//   document.body.addEventListener("change", e => {
//     if (
//       e.target.matches('input[name="updates[]"], input.qty, input.cart__qty') &&
//       !e.target.closest(`[data-variant-id="${freeGiftVariantId}"]`)
//     ) {
//       clearTimeout(reloadTimer);
//     }
//   });

//   document.body.addEventListener("click", e => {
//     if (e.target.matches('.cart__remove, .cart-remove, button[name="remove"]')) {
//       setTimeout(checkCartForGift, 300);
//     }
//   });

//   /* ------------------------------
//      UPDATE CART UI (NO RELOAD)
//   -------------------------------- */
//   document.addEventListener("cart:gift-added", () => {
//     fetch("/cart.js")
//       .then(res => res.json())
//       .then(cart => {
//         document.dispatchEvent(
//           new CustomEvent("cart:refresh", { detail: { cart } })
//         );
//       });
//   });

//   /* ------------------------------
//      INITIAL CHECK
//   -------------------------------- */
//   setTimeout(checkCartForGift, 500);
// });

// /* ==============================



//02/02/26 remove pop-up
// document.addEventListener("DOMContentLoaded", function () {

//   /* ==============================
//      CONFIG
//   ============================= */
//   const GIFT_PRODUCT_HANDLES = [
//     "festive-socks-brown-plaid",
//     "festive-socks-green-plaid",
//     "festive-socks-blue-plaid",
//     "festive-socks-orange-plaid"
//   ];

//   const MIN_QTY_TO_QUALIFY = 2;
//   const ZERO_PRICE_EXCLUDE_VARIANTS = [50835170689322];

//   let isProcessing = false;

//   /* ==============================
//      FETCH OVERRIDE — detect cart changes
//   ============================= */
//   (function () {
//     const originalFetch = window.fetch;
//     window.fetch = function (resource, options) {
//       const isCartChange =
//         typeof resource === "string" &&
//         (resource.includes("/cart/add") ||
//          resource.includes("/cart/change") ||
//          resource.includes("/cart/update"));

//       return originalFetch(resource, options).then(response => {
//         if (isCartChange) {
//           setTimeout(() => {
//             document.dispatchEvent(new Event("cart:updated"));
//           }, 300);
//         }
//         return response;
//       });
//     };
//   })();

//   /* ==============================
//      CART HELPERS
//   ============================= */
//   async function getCart() {
//     const res = await fetch("/cart.js");
//     return res.json();
//   }

//   async function addVariant(variantId) {
//     const res = await fetch("/cart/add.js", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         id: variantId,
//         quantity: 1,
//         properties: { _freeGift: "true" }
//       })
//     });

//     if (!res.ok) throw new Error("Failed to add gift");
//     return res.json();
//   }

//   async function removeLineItem(key) {
//     await fetch("/cart/change.js", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ id: key, quantity: 0 })
//     });
//   }

//   /* ==============================
//      CART UI REFRESH (ENHANCED)
//   ============================= */
//   async function refreshCartUI() {
//     try {
//       // Try multiple section combinations for better compatibility
//       const sectionsToRefresh = [
//         "cart-drawer,cart-icon-bubble,main-cart-items",
//         "cart,ajax-cart,cart-drawer",
//         "cart-drawer,cart-icon-count-bubble"
//       ];

//       for (const sections of sectionsToRefresh) {
//         try {
//           const response = await fetch(`/cart?sections=${sections}`);
//           if (response.ok) {
//             const sectionsData = await response.json();
            
//             Object.entries(sectionsData).forEach(([id, html]) => {
//               const container = document.getElementById(id) || 
//                               document.querySelector(`[data-section-id="${id}"]`) ||
//                               document.querySelector(`#${id}`);
//               if (container) {
//                 container.innerHTML = html;
//               }
//             });
//             return true; // Success
//           }
//         } catch (e) {
//           continue; // Try next section combination
//         }
//       }

//       // Additional theme-specific triggers
//       if (typeof theme !== 'undefined' && theme.CartDrawer) {
//         theme.CartDrawer.init();
//       }
      
//       // Trigger common cart events
//       document.dispatchEvent(new CustomEvent('cart:build', { bubbles: true }));
//       document.dispatchEvent(new Event("cart:updated"));
      
//       return false; // Sections refresh failed
//     } catch (error) {
//       console.warn("Cart UI refresh failed:", error);
//       return false;
//     }
//   }

//   /* ==============================
//      PAGE RELOAD HELPER
//   ============================= */
//   function reloadPageWithCartState() {
//     // Preserve cart state and reload
//     window.location.reload();
//   }

//   /* ==============================
//      PRODUCT HELPERS
//   ============================= */
//   async function fetchGiftProducts(handles) {
//     return Promise.all(
//       handles.map(handle =>
//         fetch(`/products/${handle}.js`).then(r => r.json())
//       )
//     );
//   }

//   /* ==============================
//      CHECKS
//   ============================= */
//   function isFreeGiftBlocked(cart) {
//     return cart.items.some(item =>
//       item.properties && item.properties._noFreeGift === "true"
//     );
//   }

//   function getQualifyingQuantity(cart, giftProductIds, excludedVariants) {
//     return cart.items
//       .filter(item =>
//         !giftProductIds.includes(item.product_id) &&
//         !excludedVariants.includes(item.variant_id) &&
//         !(item.properties && item.properties._noFreeGift === "true")
//       )
//       .reduce((sum, item) => sum + item.quantity, 0);
//   }

//   function findExistingGift(cart, giftProductIds) {
//     return cart.items.find(item =>
//       giftProductIds.includes(item.product_id) &&
//       item.properties &&
//       item.properties._freeGift === "true"
//     );
//   }

//   /* ==============================
//      MODAL UI (RELOAD ON GIFT ADD)
//   ============================= */
//   function showGiftModal(products, onSelect) {
//     if (document.getElementById("giftVariantModal")) return;

//     const overlay = document.createElement("div");
//     overlay.id = "giftVariantModal";

//     overlay.innerHTML = `
//       <style>
//         .gift-overlay {
//           position: fixed;
//           inset: 0;
//           background: rgba(0,0,0,.6);
//           z-index: 9999;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//         }
//         .gift-modal {
//           background: #fff;
//           padding: 24px;
//           max-width: 720px;
//           width: 100%;
//           border-radius: 8px;
//           max-height: 90vh;
//           overflow-y: auto;
//         }
//         .gift-row {
//           display: flex;
//           gap: 16px;
//           padding-bottom: 16px;
//           margin-bottom: 16px;
//           border-bottom: 1px solid #eee;
//         }
//         .gift-image {
//           width: 140px;
//           height: 140px;
//           object-fit: cover;
//           border-radius: 6px;
//         }
//         .gift-title {
//           font-weight: 600;
//           margin-bottom: 8px;
//         }
//         .variant-option {
//           display: block;
//           padding: 8px;
//           border: 1px solid #ddd;
//           margin-bottom: 6px;
//           cursor: pointer;
//         }
//         .gift-btn {
//           width: 100%;
//           background: #000;
//           color: #fff;
//           padding: 12px;
//           border: none;
//           cursor: pointer;
//         }
//         .processing .gift-btn {
//           opacity: 0.7;
//           cursor: not-allowed;
//         }
//       </style>

//       <div class="gift-overlay">
//          <div class="gift-modal">
//          <h2>Select Your Free Gift</h2>
//            <form id="giftForm">
//            ${products.map(p => `
//                <div class="gift-row">
//                 <img src="${p.images[0]}" class="gift-image">
//                  <div>
//                  <div class="gift-title">${p.title}</div>
//                   ${p.variants.filter(v => v.available).map(v => `
//                      <label class="variant-option">
//                        <input type="radio" name="giftVariant" value="${v.id}">
//                        ${v.title}
//                     </label>
//                    `).join("")}
//                 </div>
//                </div>
//             `).join("")}
//             <button type="submit" class="gift-btn">Add Gift</button>
//            </form>
//         </div>
//        </div>
//     `;

//     document.body.appendChild(overlay);

//     document.getElementById("giftForm").addEventListener("submit", async e => {
//       e.preventDefault();

//       const selected = document.querySelector('input[name="giftVariant"]:checked');
//       if (!selected) return alert("Please select a gift");

//       const overlay = document.getElementById("giftVariantModal");
//       overlay.classList.add("processing");
//       const submitBtn = overlay.querySelector(".gift-btn");
//       const originalText = submitBtn.textContent;
//       submitBtn.textContent = "Adding Gift...";

//       try {
//         await onSelect(selected.value);
        
//         // Show success message briefly
//         submitBtn.textContent = "Gift Added! Reloading...";
//         await new Promise(resolve => setTimeout(resolve, 800));
        
//         // RELOAD PAGE when gift is successfully added
//         reloadPageWithCartState();
        
//       } catch (error) {
//         alert("Failed to add gift. Please try again.");
//         console.error("Gift addition failed:", error);
//         overlay.classList.remove("processing");
//         submitBtn.textContent = originalText;
//       }
//     });
//   }

//   /* ==============================
//      MAIN FLOW (ENHANCED)
//   ============================= */
//   async function mainFlow() {
//     if (isProcessing) return;
//     isProcessing = true;

//     try {
//       const cart = await getCart();
//       if (isFreeGiftBlocked(cart)) return;

//       const giftProducts = await fetchGiftProducts(GIFT_PRODUCT_HANDLES);
//       const giftProductIds = giftProducts.map(p => p.id);

//       const qualifyingQty = getQualifyingQuantity(
//         cart,
//         giftProductIds,
//         ZERO_PRICE_EXCLUDE_VARIANTS
//       );

//       const existingGift = findExistingGift(cart, giftProductIds);

//       // REMOVE GIFT - Try UI refresh first, fallback to reload
//       if (qualifyingQty < MIN_QTY_TO_QUALIFY && existingGift) {
//         await removeLineItem(existingGift.key);
//         await new Promise(resolve => setTimeout(resolve, 800));
        
//         const uiRefreshed = await refreshCartUI();
//         if (!uiRefreshed) {
//           // Fallback to page reload if UI refresh fails
//           setTimeout(reloadPageWithCartState, 500);
//         }
//         return;
//       }

//       // ADD GIFT - Will handle reload in modal callback
//       if (qualifyingQty >= MIN_QTY_TO_QUALIFY && !existingGift) {
//         showGiftModal(giftProducts, async variantId => {
//           await addVariant(variantId);
//         });
//       }

//     } catch (error) {
//       console.error("Gift logic error:", error);
//     } finally {
//       isProcessing = false;
//     }
    
//   }

//   /* ==============================
//      EVENT LISTENERS
//   ============================= */
//   document.addEventListener("cart:updated", async () => {
//     setTimeout(mainFlow, 200);
//   });
  

//   document.body.addEventListener("change", e => {
//     if (e.target.matches('input[name="updates[]"], input.qty, input[name="quantity"], .cart__qty input')) {
//       setTimeout(() => {
//         document.dispatchEvent(new Event("cart:updated"));
//       }, 300);
//     }
//   });

//   document.body.addEventListener("click", e => {
//     if (e.target.matches(
//       '.cart__remove, .cart-remove, button[name="remove"], a[href*="cart/change"], [data-cart-remove]'
//     )) {
//       setTimeout(() => {
//         document.dispatchEvent(new Event("cart:updated"));
//       }, 400);
//     }
//   });

//   // Initial run
//   setTimeout(mainFlow, 800);

// });




// /* ===============================
//    Gift products – lock quantity
// ================================ */

// const GIFT_PRODUCT_HANDLES = [
//   "festive-socks-brown-plaid",
//   "festive-socks-green-plaid",
//   "festive-socks-blue-plaid",
//   "festive-socks-orange-plaid",
//   "gift-box-shiny-bag"
// ];

// /* Disable quantity controls for gift items */
// function lockGiftItemQuantity() {
//   const cartItems = document.querySelectorAll(
//     '[data-cart-item], .cart-item, .CartItem'
//   );

//   cartItems.forEach(item => {
//     // Try to find product link
//     const productLink = item.querySelector('a[href*="/products/"]');
//     if (!productLink) return;

//     // Extract handle from URL
//     const handle = productLink
//       .getAttribute("href")
//       .split("/products/")[1]
//       ?.split("?")[0];

//     if (!handle || !GIFT_PRODUCT_HANDLES.includes(handle)) return;

//     /* Disable quantity input */
//     const qtyInput = item.querySelector(
//       'input[name="updates[]"], input.quantity__input'
//     );
//     if (qtyInput) {
//       qtyInput.value = 1;
//       qtyInput.readOnly = true;
//       qtyInput.disabled = true;
//     }

//     /* Disable + / − buttons */
//     const qtyButtons = item.querySelectorAll(
//       'button[name="plus"], button[name="minus"], .quantity__button'
//     );

//     qtyButtons.forEach(btn => {
//       btn.disabled = true;
//       btn.style.pointerEvents = "none";
//       btn.style.opacity = "0.5";
//     });
//   });
// }

// /* Prevent quantity change via events (AJAX-safe) */
// document.addEventListener("change", event => {
//   const input = event.target;
//   if (!input.matches('input[name="updates[]"], input.quantity__input')) return;

//   const item = input.closest('[data-cart-item], .cart-item, .CartItem');
//   if (!item) return;

//   const productLink = item.querySelector('a[href*="/products/"]');
//   if (!productLink) return;

//   const handle = productLink
//     .getAttribute("href")
//     .split("/products/")[1]
//     ?.split("?")[0];

//   if (GIFT_PRODUCT_HANDLES.includes(handle)) {
//     input.value = 1;
//     event.preventDefault();
//   }
// });

// /* Run on page load */
// document.addEventListener("DOMContentLoaded", lockGiftItemQuantity);

// /* Run again after AJAX cart updates */
// document.addEventListener("cart:updated", lockGiftItemQuantity);
// document.addEventListener("ajaxCart:rendered", lockGiftItemQuantity);
