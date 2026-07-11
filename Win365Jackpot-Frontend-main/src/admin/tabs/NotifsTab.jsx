import React from "react";
import { Card } from "../components/SharedUI";
import { useAdminTheme } from "../context/AdminThemeContext";

export default function NotifsTab({ onToast }) {
  const { C } = useAdminTheme();
  return (
    <Card>
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        Notifications Tab — coming soon
      </div>
    </Card>
  );
}
