export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="text-sm text-muted underline-offset-4 hover:underline">
        Salir
      </button>
    </form>
  );
}
