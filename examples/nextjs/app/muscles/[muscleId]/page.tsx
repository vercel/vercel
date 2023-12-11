"use client"

// {
//   "name": "Hip Circles (Prone)",
//   "type": "stretching",
//   "muscle": "abductors",
//   "equipment": "None",
//   "difficulty": "intermediate",
//   "instructions": "Position yourself on your hands and knees on the ground. Maintaining good posture, raise one bent knee off of the ground. This will be your starting position. Keeping the knee in a bent position, rotate the femur in an arc, attempting to make a big circle with your knee. Perform this slowly for a number of repetitions, and repeat on the other side."
// }

import useSWR from 'swr'
import Image from 'next/image'

const BASE_URL = 'https://api.api-ninjas.com/v1'

const fetcher = (url: string) => fetch(BASE_URL+ url, {
  headers: {
    'X-Api-Key': 'zEw7Xe6MhfTMhZtXHTgbJQ==G3xydbtZtNXq34N4'
  }
}).then(r => r.json())

const MuscleDetailPage = ({ params: { muscleId } }: { params: { muscleId: string } }) => {
  const { data, error, isLoading } = useSWR(`/exercises?muscle=${muscleId}`, fetcher)

  if (isLoading || !data) return <div>Loading...</div>

  return <section className="grid gap-4 px-4 max-w-2xl">
  <h1 className="text-xl font-bold">Exercises</h1>
  {data.map((exercise: any) => {
    return <div className="border border-black p-3 flex gap-3 max-w-full">
      <div>
         <img
      src="https://picsum.photos/300/200"
      width={300}
      height={200}
      alt="Picture of the exercise"
    />
    </div>
      <div className="flex-1">
        <h2 className="text-lg font-bold">{exercise.name}</h2>
        <p >{exercise.instructions.slice(0,140)}</p></div>
    </div>
  })}
  </section>
}

export default MuscleDetailPage
