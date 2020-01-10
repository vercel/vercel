import React from 'react';
import { format, parseISO as parseDate } from 'date-fns';

export const Time: React.FC<{ date: string }> = ({ date }) => (
  <>
    {format(parseDate(date), "h:mm aaaaa")}m
  </>
)
