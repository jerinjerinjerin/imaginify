/* eslint-disable camelcase */
import { clerkClient } from "@clerk/nextjs";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";

export async function POST(req: Request) {
  // Get the webhook secret from environment variables
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local");
  }

  // Get the necessary headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If the necessary headers are missing, return an error response
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occurred -- no svix headers", {
      status: 400,
    });
  }

  // Parse the request body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify the webhook using Svix
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occurred", {
      status: 400,
    });
  }

  // Handle the webhook event
  const { id } = evt.data;
  const eventType = evt.type;

  switch (eventType) {
    case "user.created":
      const { email_addresses, image_url, first_name, last_name, username } = evt.data;

      const newUser = {
        clerkId: id,
        email: email_addresses[0].email_address,
        username: username!,
        firstName: first_name,
        lastName: last_name,
        photo: image_url,
      };

      const createdUser = await createUser(newUser);

      if (createdUser) {
        await clerkClient.users.updateUserMetadata(id, {
          publicMetadata: { userId: createdUser._id },
        });
      }

      return NextResponse.json({ message: "User created successfully", user: createdUser });

    case "user.updated":
      const updatedUserDetails = {
        firstName: evt.data.first_name,
        lastName: evt.data.last_name,
        username: evt.data.username!,
        photo: evt.data.image_url,
      };

      const updatedUser = await updateUser(id, updatedUserDetails);

      return NextResponse.json({ message: "User updated successfully", user: updatedUser });

    case "user.deleted":
      const deletedUser = await deleteUser(id!);

      return NextResponse.json({ message: "User deleted successfully", user: deletedUser });

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  console.log(`Webhook with ID ${id} and type ${eventType}`);
  console.log("Webhook body:", body);

  return new Response("", { status: 200 });
}
