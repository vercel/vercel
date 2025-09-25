import React, { useState } from "react";

export default function BetStakingCalculator() {
  const [accOdds, setAccOdds] = useState("");
  const [indOdd, setIndOdd] = useState("");
  const [stake, setStake] = useState(null);

  const targetWin = 50000000; // Fixed target ₦50,000,000

  const calculateStake = () => {
    const acc = parseFloat(accOdds);
    const ind = parseFloat(indOdd);

    if (!acc || !ind || acc <= 0 || ind <= 0) {
      setStake("Please enter valid odds");
      return;
    }

    const totalOdds = acc * ind;
    const requiredStake = targetWin / totalOdds;
    setStake(requiredStake.toFixed(2));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white shadow-lg rounded-2xl p-6 w-96">
        <h1 className="text-xl font-bold text-center mb-4">
          Bet Staking Calculator
        </h1>
        <div className="mb-4">
          <label className="block mb-1">Accumulated Odds</label>
          <input
            type="number"
            value={accOdds}
            onChange={(e) => setAccOdds(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="e.g. 25.5"
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Independent Game Odd</label>
          <input
            type="number"
            value={indOdd}
            onChange={(e) => setIndOdd(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="e.g. 3.5"
          />
        </div>
        <button
          onClick={calculateStake}
          className="w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700"
        >
          Calculate
        </button>
        {stake && (
          <div className="mt-4 text-center">
            <p className="text-lg">
              Required Stake: <span className="font-bold">₦{stake}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
