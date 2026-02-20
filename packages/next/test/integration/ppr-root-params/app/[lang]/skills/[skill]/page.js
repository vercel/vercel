export default async function Page({ params }) {
  const { lang, skill } = await params;

  return (
    <div>
      Skill {skill} in {lang}
    </div>
  );
}
