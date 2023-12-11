import Image from 'next/image'
import Link from 'next/link'

const muscleGroups = [
  {name: "abdominals"},
  {name: "abductors"},
  {name: "adductors"},
  {name: "biceps"},
  {name: "calves"},
  {name: "chest"},
  {name: "forearms"},
  {name: "glutes"},
  {name: "hamstrings"},
  {name: "lats"},
  {name: "lower_back"},
  {name: "middle_back"},
  {name: "neck"},
  {name: "quadriceps"},
  {name: "traps"},
  {name: "triceps"}
]

export default function Home() {
  return (
    <main className="p-24">
      <h1>Muscle groups</h1>
      {muscleGroups.map((muscleGroup) => {
        return <div><Link href={`/muscles/${muscleGroup.name}`}>{muscleGroup.name}</Link></div>
      })}
    </main>
  )
}
