"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getPushInstallationId,
  getPushPlatform,
  normalizePushPermissionState,
  resolvePushNotificationPath,
} from "@/lib/pushNotifications";

async function syncPushDevice(args: {
  token?: string | null;
  permissionState: string;
  enabled: boolean;
  lastError?: string | null;
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  await fetch("/api/push/device", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      installationId: getPushInstallationId(),
      platform: getPushPlatform(),
      token: args.token ?? null,
      enabled: args.enabled,
      permissionState: args.permissionState,
      lastError: args.lastError ?? null,
    }),
  });
}

async function bootstrapPushRegistration() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const permission = await PushNotifications.checkPermissions();
  const permissionState = normalizePushPermissionState(permission.receive);

  if (permissionState !== "granted") {
    await syncPushDevice({
      enabled: false,
      permissionState,
    });
    return;
  }

  if (Capacitor.getPlatform() === "android") {
    await PushNotifications.createChannel({
      id: "updates",
      name: "Pool updates",
      description: "Pool activity and scoring updates",
      importance: 4,
      visibility: 1,
    }).catch(() => {});
  }

  await PushNotifications.register();
}

export default function AppPushNotifications() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isMounted = true;
    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let registrationErrorHandle: { remove: () => Promise<void> } | null = null;
    let actionHandle: { remove: () => Promise<void> } | null = null;

    const setup = async () => {
      registrationHandle = await PushNotifications.addListener("registration", async (token) => {
        if (!isMounted) return;
        await syncPushDevice({
          token: token.value,
          enabled: true,
          permissionState: "granted",
        });
      });

      registrationErrorHandle = await PushNotifications.addListener("registrationError", async (error) => {
        if (!isMounted) return;
        await syncPushDevice({
          enabled: false,
          permissionState: "denied",
          lastError: typeof error.error === "string" ? error.error : "Push registration failed.",
        });
      });

      actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        if (!isMounted) return;
        const nextPath = resolvePushNotificationPath(action.notification.data);
        if (nextPath) {
          router.push(nextPath);
        }
      });

      await bootstrapPushRegistration().catch(() => {});
    };

    void setup();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      void bootstrapPushRegistration().catch(() => {});
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
      void registrationHandle?.remove();
      void registrationErrorHandle?.remove();
      void actionHandle?.remove();
    };
  }, [router]);

  return null;
}
