import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
  import Autocomplete from "./Autocomplete";
import Modal from './Modal.js';
import { MDBCol, MDBIcon } from "mdbreact";
var names = [];
require("./styles.css");



require("./styles.css");
localStorage.setItem("count", 0);
localStorage.setItem("names", JSON.stringify(names));
class App extends Component {

constructor(props) {
    super(props);

  
    this.state = {value: ''};
   this.state = {
      show: false
    };

    var names = [];
localStorage.setItem("count", 0);
    this.showModal = this.showModal.bind(this);
    this.hideModal = this.hideModal.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.imagesrc="";
  }

  handleChange(event) {
    this.setState({value: event.target.value});
  }
  showModal = (e) => {
    this.setState({ show: true });
    this.setState({ imagesrc: e.target.getAttribute( 'src') });
    
  };

  hideModal = () => {
    this.setState({ show: false });
  };
  handleSubmit(event) {

    this.setState({
      value: ""
    })
   
    names[localStorage.getItem("count")] = this.state.value;
 localStorage.setItem("names", JSON.stringify(names));
 var namelist = JSON.parse(localStorage.getItem("names"));
 

 
  var a=parseInt(localStorage.getItem("count"))+1;
localStorage.setItem("count",a);

    fetch('https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=e82316c1e5694bb17b8723a3c02437e9&text='+this.state.value+'&format=json&nojsoncallback=1')
    .then(function(response){
      return response.json();
    }) 
    .then(


      function(j){
      if (j.photos!==undefined) {
      let picArray = j.photos.photo.map((pic) => {
        
        var srcPath = 'https://farm'+pic.farm+'.staticflickr.com/'+pic.server+'/'+pic.id+'_'+pic.secret+'.jpg';
     
        return(
         <img  onClick={this.showModal} src={srcPath} />        )
      })
      this.setState({pictures: picArray});
}else{
  alert("No Such Image Present in Database");
  this.componentDidMount();

}

    }.bind(this))
    event.preventDefault();
  }

 onClick = (t) => {
    this.setState({
      value: t.target.getAttribute('value')
    })
   
  }

  componentDidMount(){
    fetch('https://www.flickr.com/services/rest/?method=flickr.photos.getRecent&api_key=e82316c1e5694bb17b8723a3c02437e9&format=json&nojsoncallback=1')
    .then(function(response){
      return response.json();
    }) 
    .then(function(j){
      
      let picArray = j.photos.photo.map((pic) => {
        
        var srcPath = 'https://farm'+pic.farm+'.staticflickr.com/'+pic.server+'/'+pic.id+'_'+pic.secret+'.jpg';
     
        return(
         <img  onClick={ this.showModal} src={srcPath} />
        )
      })
      this.setState({pictures: picArray});
    }.bind(this))
  }
     makeDog(e) {
 
 
}

  render() {
  

      return (

      <div className="App">
        <header  className="App-header">
          
          <h1 className="App-title">SEARCH PHOTOS</h1>

     <form onSubmit={this.handleSubmit}>
        
       
          <MDBCol md="6">
      <div className="input-group md-form form-sm form-1 pl-0">
        <div className="input-group-prepend">
          <span className="input-group-text purple lighten-3" id="basic-text1">
            <MDBIcon className="text-white" icon="search" />
          </span>
        </div>
      
        <input className="form-control my-0 py-1" type="text" placeholder="Search" value={this.state.value} onChange={this.handleChange} aria-label="Search" />
   <a href="">clear searches</a>
   <ul>
      {names.map(names => (
       <li  onClick={this.onClick} value={names} key={names}>{names}</li>
      ))}
    </ul>
          
 <br /><br />
      </div>
    </MDBCol>
      </form>     
        </header>
        <div  className="App-intro">
         {this.state.pictures}

        </div>
<Modal show={this.state.show} handleClose={this.hideModal}>
          
          <img src={this.state.imagesrc}/>
        </Modal>
    <div className="autocomplete-wrapper">
      
      </div>
      </div>
    );
  }
}

export default App;
