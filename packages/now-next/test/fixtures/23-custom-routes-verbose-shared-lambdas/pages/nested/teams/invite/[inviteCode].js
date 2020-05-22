function InviteCode(props) {
  return <p>invite code: {props.query?.inviteCode}</p>
}

InviteCode.getInitialProps = ({ query }) => ({
  query
})

export default InviteCode
