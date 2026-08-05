import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../types";
import LoginPage from "./LoginPage";

const authState = vi.hoisted(() => ({
  demo: false,
  loading: false,
  user: null as Profile | null,
  signIn: vi.fn(),
  signUpMember: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../components/RallyPointLogo", () => ({
  RallyPointLogo: () => <div aria-label="Rally Point logo" />,
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

function switchToJoin() {
  const buttons = screen.getAllByRole("button", { name: "Join as member" });
  return buttons[0];
}

function loginSubmitButton() {
  const button = screen
    .getAllByRole("button", { name: "Log in" })
    .find((candidate) => candidate.getAttribute("type") === "submit");
  if (!button) throw new Error("Could not find login submit button");
  return button;
}

describe("LoginPage authentication form safety", () => {
  beforeEach(() => {
    authState.demo = false;
    authState.loading = false;
    authState.user = null;
    authState.signIn.mockReset();
    authState.signUpMember.mockReset();
    authState.signOut.mockReset();
    authState.refresh.mockReset();
  });

  it("transfers the email from login to sign up but clears the password", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "Player@Example.com");
    await user.type(screen.getByLabelText("Password"), "never-copy-this");
    const joinButton = switchToJoin();
    expect(joinButton).toHaveClass("min-h-12");
    await user.click(joinButton);

    expect(screen.getByLabelText("Email")).toHaveValue("Player@Example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("preserves the email when returning to login and never writes form passwords to web storage", async () => {
    const user = userEvent.setup();
    const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
    renderLogin();

    await user.click(switchToJoin());
    await user.type(screen.getByLabelText("Email"), "player@example.com");
    await user.type(screen.getByLabelText("Password"), "not-persisted");
    await user.click(screen.getAllByRole("button", { name: "Log in" })[0]);

    expect(screen.getByLabelText("Email")).toHaveValue("player@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(storageSetItem).not.toHaveBeenCalled();
  });

  it("toggles password visibility with an accessible keyboard control", async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });

    expect(password).toHaveAttribute("type", "password");
    expect(toggle).toHaveClass("min-h-12", "min-w-12");

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(password).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("announces the generic server rate-limit message without revealing account state", async () => {
    const user = userEvent.setup();
    authState.signIn.mockRejectedValue(
      new Error("Too many attempts. Please try again in about 5 minutes."),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "player@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(loginSubmitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Please try again in about 5 minutes.",
    );
    expect(authState.signIn).toHaveBeenCalledWith(
      "player@example.com",
      "wrong-password",
    );
  });

  it("keeps demo-only accounts visibly separate from live authentication", () => {
    authState.demo = false;
    const { unmount } = renderLogin();

    expect(screen.queryByText("Quick demo logins")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Staff \/ admin accounts are created by the club/i),
    ).toBeInTheDocument();

    unmount();
    authState.demo = true;
    renderLogin();

    expect(screen.getByText("Quick demo logins")).toBeInTheDocument();
    expect(
      screen.queryByText(/Staff \/ admin accounts are created by the club/i),
    ).not.toBeInTheDocument();
  });
});
