import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp, initialize } from "../server/app.js";
import { newInvoice, defaultSeller } from "../src/utils/invoiceTypes.ts";
process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "integration-test-secret";
const db = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { downloadDir: "/tmp/billing-mongodb" },
});
try {
  await mongoose.connect(db.getUri());
  await initialize();
  const app = createApp();
  await request(app)
    .get("/api/health")
    .expect(200, { server: "ok", database: "connected" });
  await request(app).get("/api/products").expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ username: "test-admin", password: "wrong" })
    .expect(401);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ username: "test-admin", password: "test-password" })
    .expect(200);
  const token = login.body.token;
  const call = (method, path, body) =>
    request(app)
      [method]("/api" + path)
      .set("Authorization", "Bearer " + token)
      .send(body);
  const p = (
    await call("post", "/products", {
      id: "p",
      name: "Double Decker 5 Doors",
      code: "DD5",
      barcode: "",
      hsn: "940320",
      category: "Racks",
      price: 7500,
      gstPercent: 18,
      stock: 20,
    }).expect(201)
  ).body;
  const a = (
    await call("post", "/buyers", {
      id: "a",
      name: "JP ISMAIL KHAN",
      mobile: "8884052640",
      address: "Bengaluru",
    }).expect(201)
  ).body;
  await call("post", "/buyers", { id: "b", name: "NEW CUSTOMER" }).expect(201);
  assert.equal(
    (await call("get", "/buyers?search=8884").expect(200)).body.length,
    1,
  );
  await call("put", "/buyers/a", { ...a, notes: "Regular buyer" }).expect(200);
  let rate = (
    await call("post", "/buyer-prices", {
      id: "rate",
      buyer: "a",
      product: "p",
      price: 7200,
    }).expect(201)
  ).body;
  await call("post", "/buyer-prices", {
    id: "duplicate",
    buyer: "a",
    product: "p",
    price: 7100,
  }).expect(409);
  assert.equal(
    (
      await call("get", "/buyer-prices/resolve?buyerId=a&productId=p").expect(
        200,
      )
    ).body.price,
    7200,
  );
  assert.equal(
    (
      await call("get", "/buyer-prices/resolve?buyerId=b&productId=p").expect(
        200,
      )
    ).body.price,
    7500,
  );
  let inv = {
    ...newInvoice(),
    number: "1597",
    date: "2026-09-15",
    buyerId: "a",
    buyer: a,
    seller: defaultSeller,
    status: "Completed",
    items: [
      {
        id: "row",
        productId: "p",
        name: p.name,
        hsn: p.hsn,
        qty: 5,
        price: 7100,
        finalPrice: 7100,
        normalPriceAtSale: 7500,
        buyerPriceAtSale: 7200,
        gstPercent: 18,
      },
    ],
  };
  inv = (await call("post", "/invoices", inv).expect(201)).body;
  assert.equal(inv.items[0].finalPrice, 7100);
  assert.equal(inv.items[0].amount, 35500);
  const stock = async () =>
    (await call("get", "/products/p").expect(200)).body.stock;
  assert.equal(await stock(), 15);
  await call("post", "/invoices", inv).expect(409);
  assert.equal(await stock(), 15);
  inv = (await call("put", "/invoices/" + inv.id, inv).expect(200)).body;
  assert.equal(await stock(), 15);
  rate = (
    await call("put", "/buyer-prices/rate", { ...rate, price: 7300 }).expect(
      200,
    )
  ).body;
  const updated = (await call("get", "/products/p").expect(200)).body;
  await call("put", "/products/p", {
    ...updated,
    name: "Renamed rack",
    price: 8000,
  }).expect(200);
  assert.equal(
    (await call("get", "/invoices/" + inv.id).expect(200)).body.items[0]
      .finalPrice,
    7100,
  );
  assert.equal(
    (await call("get", "/invoices/" + inv.id).expect(200)).body.items[0].name,
    p.name,
  );
  assert.equal(
    (
      await call(
        "get",
        "/invoices?buyer=JP&mobile=8884&invoiceNumber=1597&from=2026-09-01&to=2026-09-30",
      ).expect(200)
    ).body.length,
    1,
  );
  assert.equal(
    (await call("get", "/invoices?buyer=%5B").expect(200)).body.length,
    0,
  );
  inv = (
    await call("put", "/invoices/" + inv.id, {
      ...inv,
      items: inv.items.map((r) => ({ ...r, qty: 7 })),
    }).expect(200)
  ).body;
  assert.equal(await stock(), 13);
  await call("put", "/invoices/" + inv.id, { ...inv, revision: 0 }).expect(409);
  assert.equal(await stock(), 13);
  await call("put", "/invoices/" + inv.id, {
    ...inv,
    items: inv.items.map((r) => ({ ...r, qty: 100 })),
  }).expect(400);
  assert.equal(await stock(), 13);
  inv = (
    await call("put", "/invoices/" + inv.id, {
      ...inv,
      status: "Cancelled",
    }).expect(200)
  ).body;
  assert.equal(await stock(), 20);
  await call("delete", "/invoices/" + inv.id, inv).expect(200);
  assert.equal(await stock(), 20);
  const completed = (
    await call("post", "/invoices", {
      ...inv,
      id: "second",
      number: "1598",
      revision: 0,
      status: "Completed",
    }).expect(201)
  ).body;
  assert.equal(await stock(), 13);
  await call("delete", "/invoices/second", completed).expect(200);
  assert.equal(await stock(), 20);
  await call("delete", "/buyer-prices/rate", rate).expect(200);
  assert.equal(
    (
      await call("get", "/buyer-prices/resolve?buyerId=a&productId=p").expect(
        200,
      )
    ).body.price,
    8000,
  );
  await call("delete", "/buyers/b").expect(200);
  const competing=await Promise.all(['race-a','race-b'].map(id=>call('post','/invoices',{...inv,id,number:id,status:'Completed',revision:0,items:inv.items.map(r=>({...r,qty:15}))})));
  assert.deepEqual(competing.map(r=>r.status).sort(),[201,400]);assert.equal(await stock(),5);
  const winner=competing.find(r=>r.status===201).body;await call('delete','/invoices/'+winner.id,winner).expect(200);assert.equal(await stock(),20);
  await call('post','/import',{products:[p],sales:[]}).expect(409);
  await call('delete','/products/p').expect(200);
  const imported={...inv,id:'imported',number:'IMPORT-1',status:'Completed',items:inv.items.map(r=>({...r,qty:3}))};
  await call('post','/import',{products:[{...p,stock:17}],sales:[imported]}).expect(200);
  assert.equal(await stock(),17);
  const importedSaved=(await call('get','/invoices/imported').expect(200)).body;
  await call('delete','/invoices/imported',importedSaved).expect(200);assert.equal(await stock(),20);
  await mongoose.disconnect();
  await request(app).get("/api/health").expect(503);
  await call("get", "/products").expect(503);
  console.log(
    "PASS: health, auth, buyer CRUD/search, products, duplicate pricing, fallback, immutable snapshots, combined filters, stock complete/edit/cancel/delete, stale revisions and rollback.",
  );
} finally {
  await mongoose.disconnect();
  await db.stop();
}
